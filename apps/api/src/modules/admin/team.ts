import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { db, AdminUserRecord } from '../../db/index.js';
import { query } from '../../db/pool.js';
import { requireAdminAuth } from '../../lib/adminAuth.js';
import { hashPassword } from '../../lib/security.js';

const VALID_ROLES = [
  'SUPER_ADMIN',
  'CONTENT_MANAGER',
  'EXAM_EDITOR',
  'REVIEWER',
  'CA_EDITOR',
  'TRANSLATOR',
  'SUPPORT',
  'ANALYST',
  'AUDITOR',
] as const;

export const teamRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /admin/team
   * List all administrative staff members with active status and roles
   */
  fastify.get(
    '/admin/team',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'AUDITOR'])] },
    async (_request, reply) => {
      const staffList = Array.from(db.adminUsers.values()).map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        is2faEnabled: user.is2faEnabled,
        tokenVersion: user.tokenVersion || 1,
        invitedBy: user.invitedBy || null,
        invitationExpiresAt: user.invitationExpiresAt || null,
        deactivatedAt: user.deactivatedAt || null,
        createdAt: user.createdAt,
      }));

      // Sort Super Admins first, then by creation date
      staffList.sort((a, b) => {
        if (a.role === 'SUPER_ADMIN' && b.role !== 'SUPER_ADMIN') return -1;
        if (b.role === 'SUPER_ADMIN' && a.role !== 'SUPER_ADMIN') return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      return reply.send({
        success: true,
        data: staffList,
        total: staffList.length,
      });
    }
  );

  /**
   * POST /admin/team/invite
   * Super Admin provisions a new staff member with an expiring invitation
   */
  fastify.post(
    '/admin/team/invite',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { email, name, role } = request.body as {
        email?: string;
        name?: string;
        role?: string;
      };

      if (!email || !email.includes('@')) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_EMAIL', message: 'Valid email address is required for staff invitation.' },
        });
      }

      if (!name || name.trim().length === 0) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_NAME', message: 'Staff member name is required.' },
        });
      }

      if (!role || !VALID_ROLES.includes(role as any)) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_ROLE',
            message: `Role must be one of: ${VALID_ROLES.join(', ')}`,
          },
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Check if email already in use
      const existingUser = Array.from(db.adminUsers.values()).find(
        (u) => u.email.toLowerCase() === normalizedEmail
      );
      if (existingUser) {
        return reply.code(409).send({
          success: false,
          error: { code: 'STAFF_ALREADY_EXISTS', message: `Staff account with email '${normalizedEmail}' already exists.` },
        });
      }

      const staffId = `adm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const invitationToken = crypto.randomBytes(32).toString('hex');
      const invitationExpiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      const tempPasswordHash = await hashPassword(crypto.randomBytes(16).toString('hex'));

      const newStaff: AdminUserRecord = {
        id: staffId,
        email: normalizedEmail,
        name: name.trim(),
        role: role as any,
        passwordHash: tempPasswordHash,
        totpSecret: 'PENDING_PROVISIONING',
        is2faEnabled: false,
        isActive: true,
        tokenVersion: 1,
        invitedBy: admin.id,
        invitationToken,
        invitationExpiresAt,
        createdAt: new Date().toISOString(),
      };

      await db.adminUsers.set(staffId, newStaff);

      try {
        await query(
          `INSERT INTO admin_users (
            id, email, name, role, password_hash, totp_secret, is_2fa_enabled,
            is_active, token_version, invited_by, invitation_token, invitation_expires_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
          [
            staffId,
            normalizedEmail,
            name.trim(),
            role,
            tempPasswordHash,
            'PENDING_PROVISIONING',
            false,
            true,
            1,
            admin.id,
            invitationToken,
            invitationExpiresAt,
          ]
        );
      } catch (err: any) {
        console.warn('[Team] Failed to insert admin_user into PostgreSQL:', err.message);
      }

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'STAFF_MANAGEMENT',
        action: 'INVITE_STAFF',
        targetId: staffId,
        changesDiff: { email: normalizedEmail, name: name.trim(), role },
        ipAddress: request.ip,
      });

      return reply.status(201).send({
        success: true,
        message: 'Staff invitation created successfully. Activation link valid for 7 days.',
        invitationToken,
        user: {
          id: staffId,
          name: newStaff.name,
          email: newStaff.email,
          role: newStaff.role,
          isActive: newStaff.isActive,
          invitationExpiresAt: newStaff.invitationExpiresAt,
        },
      });
    }
  );

  /**
   * PATCH /admin/team/:id
   * Super Admin updates staff role, details, or active state
   * Enforces transactional invariant preventing demotion/deactivation of the last active Super Admin
   */
  fastify.patch(
    '/admin/team/:id',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { id } = request.params as { id: string };
      const { name, role, isActive } = request.body as {
        name?: string;
        role?: string;
        isActive?: boolean;
      };

      const targetUser = db.adminUsers.get(id);
      if (!targetUser) {
        return reply.code(404).send({
          success: false,
          error: { code: 'STAFF_NOT_FOUND', message: 'Staff member does not exist.' },
        });
      }

      // Fresh MFA check for role change or deactivation
      const isRoleChange = role !== undefined && role !== targetUser.role;
      const isDeactivation = isActive === false && targetUser.isActive;
      if (isRoleChange || isDeactivation) {
        if (!admin.mfaVerifiedAt || (Date.now() - admin.mfaVerifiedAt) > 600 * 1000) {
          return reply.code(428).send({
            success: false,
            error: {
              code: 'STEP_UP_MFA_REQUIRED',
              message: 'Staff role changes and account deactivations require fresh multi-factor verification.',
            },
          });
        }
      }

      // CRITICAL INVARIANT: Prevent demotion or deactivation of last active Super Admin
      if (targetUser.role === 'SUPER_ADMIN') {
        const willBeDemoted = role !== undefined && role !== 'SUPER_ADMIN';
        const willBeDeactivated = isActive === false;

        if (willBeDemoted || willBeDeactivated) {
          const otherActiveSuperAdmins = Array.from(db.adminUsers.values()).filter(
            (u) => u.id !== id && u.role === 'SUPER_ADMIN' && u.isActive
          );

          if (otherActiveSuperAdmins.length === 0) {
            return reply.code(400).send({
              success: false,
              error: {
                code: 'CANNOT_DEMOTE_LAST_SUPER_ADMIN',
                message: 'Action prohibited. The system must retain at least one active Super Admin account.',
              },
            });
          }
        }
      }

      if (role && !VALID_ROLES.includes(role as any)) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_ROLE', message: `Role must be one of: ${VALID_ROLES.join(', ')}` },
        });
      }

      const oldState = { name: targetUser.name, role: targetUser.role, isActive: targetUser.isActive };

      if (name && name.trim().length > 0) targetUser.name = name.trim();
      if (role) targetUser.role = role as any;

      if (typeof isActive === 'boolean') {
        targetUser.isActive = isActive;
        if (!isActive) {
          // Immediately revoke sessions on deactivation
          targetUser.tokenVersion = (targetUser.tokenVersion || 1) + 1;
          targetUser.deactivatedAt = new Date().toISOString();
        } else {
          targetUser.deactivatedAt = undefined;
        }
      }

      await db.adminUsers.set(id, targetUser);

      try {
        await query(
          `UPDATE admin_users 
           SET name = $2, role = $3, is_active = $4, token_version = $5, deactivated_at = $6
           WHERE id = $1`,
          [
            id,
            targetUser.name,
            targetUser.role,
            targetUser.isActive,
            targetUser.tokenVersion || 1,
            targetUser.deactivatedAt || null,
          ]
        );

        if (isDeactivation || isRoleChange) {
          await query(
            `UPDATE admin_trusted_devices 
             SET revoked_at = NOW(), revoke_reason = $1 
             WHERE admin_id = $2 AND revoked_at IS NULL`,
            [isDeactivation ? 'ACCOUNT_DEACTIVATED' : 'ROLE_CHANGED', id]
          );
        }
      } catch (err: any) {
        console.warn('[Team] Failed to update admin_user in PostgreSQL:', err.message);
      }

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'STAFF_MANAGEMENT',
        action: 'UPDATE_STAFF',
        targetId: id,
        changesDiff: { from: oldState, to: { name: targetUser.name, role: targetUser.role, isActive: targetUser.isActive } },
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        message: 'Staff member updated successfully.',
        user: {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
          role: targetUser.role,
          isActive: targetUser.isActive,
          tokenVersion: targetUser.tokenVersion || 1,
          deactivatedAt: targetUser.deactivatedAt || null,
        },
      });
    }
  );

  /**
   * POST /admin/team/:id/revoke
   * Revoke all active sessions for a staff member immediately
   */
  fastify.post(
    '/admin/team/:id/revoke',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { id } = request.params as { id: string };

      const targetUser = db.adminUsers.get(id);
      if (!targetUser) {
        return reply.code(404).send({
          success: false,
          error: { code: 'STAFF_NOT_FOUND', message: 'Staff member does not exist.' },
        });
      }

      targetUser.tokenVersion = (targetUser.tokenVersion || 1) + 1;
      await db.adminUsers.set(id, targetUser);

      try {
        await query(
          `UPDATE admin_users SET token_version = token_version + 1 WHERE id = $1`,
          [id]
        );
      } catch (err: any) {
        console.warn('[Team] Failed to increment token_version in PostgreSQL:', err.message);
      }

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'STAFF_MANAGEMENT',
        action: 'REVOKE_STAFF_SESSIONS',
        targetId: id,
        changesDiff: { newTokenVersion: targetUser.tokenVersion },
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        message: `All active sessions for '${targetUser.name}' have been revoked immediately.`,
      });
    }
  );

  /**
   * GET /admin/team/:id/consequences
   * Inspection of consequences before permanent staff deletion
   */
  fastify.get(
    '/admin/team/:id/consequences',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const targetUser = db.adminUsers.get(id);
      if (!targetUser) {
        return reply.code(404).send({
          success: false,
          error: { code: 'STAFF_NOT_FOUND', message: 'Staff member does not exist.' },
        });
      }

      // Check active super admin count
      const otherActiveSuperAdmins = Array.from(db.adminUsers.values()).filter(
        (u) => u.id !== id && u.role === 'SUPER_ADMIN' && u.isActive
      );
      const isLastSuperAdmin = targetUser.role === 'SUPER_ADMIN' && otherActiveSuperAdmins.length === 0;

      // Query active trusted devices
      let trustedDevicesCount = 0;
      try {
        const tdRes = await query<{ count: string }>(
          `SELECT count(*) as count FROM admin_trusted_devices WHERE admin_id = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
          [id]
        );
        trustedDevicesCount = parseInt(tdRes.rows[0]?.count || '0', 10);
      } catch {}

      // Query audit events count
      let auditEventsCount = 0;
      try {
        const aeRes = await query<{ count: string }>(
          `SELECT count(*) as count FROM audit_events WHERE actor_id = $1`,
          [id]
        );
        auditEventsCount = parseInt(aeRes.rows[0]?.count || '0', 10);
      } catch {}

      return reply.send({
        success: true,
        data: {
          member: {
            id: targetUser.id,
            name: targetUser.name,
            email: targetUser.email,
            role: targetUser.role,
            isActive: targetUser.isActive,
            createdAt: targetUser.createdAt,
          },
          trustedDevicesCount,
          auditEventsCount,
          isLastSuperAdmin,
          consequences: [
            'Staff record will be permanently deleted from PostgreSQL database.',
            'All active JWT tokens and sessions will be invalidated immediately.',
            `${trustedDevicesCount} active 7-day trusted device cookie(s) will be revoked immediately.`,
            'Pending password reset links and staff invitations will be revoked.',
            `${auditEventsCount} historical audit log event(s) and exam contributions will be preserved with a deleted-actor tombstone attribution.`,
            'This action is irreversible. Deleted staff accounts cannot be recovered.',
          ],
        },
      });
    }
  );

  /**
   * DELETE /admin/team/:id/permanent
   * Super Admin permanently purges a staff account with mandatory recent MFA
   */
  fastify.delete(
    '/admin/team/:id/permanent',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { id } = request.params as { id: string };
      const { reason, confirmEmail } = (request.body as { reason?: string; confirmEmail?: string }) || {};

      // 1. Fresh MFA verification (within 600s)
      if (!admin.mfaVerifiedAt || Date.now() - admin.mfaVerifiedAt > 600 * 1000) {
        return reply.code(428).send({
          success: false,
          error: {
            code: 'STEP_UP_MFA_REQUIRED',
            message: 'Permanent staff account deletion requires fresh multi-factor authentication (within 10 minutes).',
          },
        });
      }

      // 2. Validate target existence
      const targetUser = db.adminUsers.get(id);
      if (!targetUser) {
        return reply.code(404).send({
          success: false,
          error: { code: 'STAFF_NOT_FOUND', message: 'Staff member does not exist.' },
        });
      }

      // 3. Last Super Admin protection
      if (targetUser.role === 'SUPER_ADMIN') {
        const otherActiveSuperAdmins = Array.from(db.adminUsers.values()).filter(
          (u) => u.id !== id && u.role === 'SUPER_ADMIN' && u.isActive
        );
        if (otherActiveSuperAdmins.length === 0) {
          return reply.code(400).send({
            success: false,
            error: {
              code: 'CANNOT_DELETE_LAST_SUPER_ADMIN',
              message: 'Action prohibited. Cannot permanently delete the last active Super Admin account.',
            },
          });
        }
      }

      // 4. Validate email confirmation
      if (!confirmEmail || confirmEmail.trim().toLowerCase() !== targetUser.email.toLowerCase()) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'CONFIRMATION_EMAIL_MISMATCH',
            message: `You must type the exact staff email (${targetUser.email}) to confirm permanent deletion.`,
          },
        });
      }

      // 5. Validate reason
      if (!reason || reason.trim().length < 5) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'REASON_REQUIRED',
            message: 'A detailed administrative reason (at least 5 characters) is required for permanent staff deletion.',
          },
        });
      }

      const emailRedacted = targetUser.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
      const tombstoneId = `tomb_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      // 6. Execute transactional deletion
      try {
        await query('BEGIN');

        // Insert deletion tombstone
        await query(
          `INSERT INTO admin_deletion_tombstones (
            id, deleted_admin_id, email_redacted, role, deleted_by, reason, deleted_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [tombstoneId, id, emailRedacted, targetUser.role, admin.id, reason.trim()]
        );

        // Update historical audit events with deleted-actor attribution
        await query(
          `UPDATE audit_events
           SET actor_status = 'DELETED',
               deleted_actor_ref = json_build_object(
                 'tombstone_id', $1::text,
                 'name', $2::text,
                 'role', $3::text,
                 'email_redacted', $4::text,
                 'deleted_at', NOW()
               )
           WHERE actor_id = $5`,
          [tombstoneId, targetUser.name, targetUser.role, emailRedacted, id]
        );

        // Revoke trusted devices
        await query(
          `DELETE FROM admin_trusted_devices WHERE admin_id = $1`,
          [id]
        );

        // Revoke password resets
        await query(
          `DELETE FROM admin_password_resets WHERE admin_id = $1`,
          [id]
        );

        // Permanently delete admin_users row
        await query(
          `DELETE FROM admin_users WHERE id = $1`,
          [id]
        );

        await query('COMMIT');
      } catch (err: any) {
        await query('ROLLBACK').catch(() => {});
        console.error('[Team] Permanent deletion transaction failed:', err);
        return reply.code(500).send({
          success: false,
          error: { code: 'DELETION_FAILED', message: `Database transaction failed: ${err.message}` },
        });
      }

      // 7. Remove from in-memory cache
      await db.adminUsers.delete(id);

      // 8. Log deletion in audit log by the deleting Super Admin
      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'STAFF_MANAGEMENT',
        action: 'PERMANENTLY_DELETE_STAFF',
        targetId: id,
        changesDiff: {
          deletedAdminId: id,
          deletedAdminEmail: emailRedacted,
          deletedAdminRole: targetUser.role,
          reason: reason.trim(),
          tombstoneId,
        },
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        message: `Staff member '${targetUser.name}' (${targetUser.email}) has been permanently deleted from PostgreSQL database.`,
        tombstoneId,
      });
    }
  );

  /**
   * DELETE /admin/team/:id
   * Super Admin removes a staff member (deactivates & revokes credentials)
   * Enforces transactional invariant preventing deletion of last active Super Admin
   */
  fastify.delete(
    '/admin/team/:id',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { id } = request.params as { id: string };

      const targetUser = db.adminUsers.get(id);
      if (!targetUser) {
        return reply.code(404).send({
          success: false,
          error: { code: 'STAFF_NOT_FOUND', message: 'Staff member does not exist.' },
        });
      }

      // CRITICAL INVARIANT: Prevent removal of last active Super Admin
      if (targetUser.role === 'SUPER_ADMIN') {
        const otherActiveSuperAdmins = Array.from(db.adminUsers.values()).filter(
          (u) => u.id !== id && u.role === 'SUPER_ADMIN' && u.isActive
        );

        if (otherActiveSuperAdmins.length === 0) {
          return reply.code(400).send({
            success: false,
            error: {
              code: 'CANNOT_REMOVE_LAST_SUPER_ADMIN',
              message: 'Action prohibited. The system must retain at least one active Super Admin account.',
            },
          });
        }
      }

      // Perform durable deactivation & credential revocation to preserve audit trail
      targetUser.isActive = false;
      targetUser.deactivatedAt = new Date().toISOString();
      targetUser.tokenVersion = (targetUser.tokenVersion || 1) + 1;
      await db.adminUsers.set(id, targetUser);

      try {
        await query(
          `UPDATE admin_users SET is_active = false, deactivated_at = NOW(), token_version = token_version + 1 WHERE id = $1`,
          [id]
        );
      } catch (err: any) {
        console.warn('[Team] Failed to soft-delete admin_user in PostgreSQL:', err.message);
      }

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'STAFF_MANAGEMENT',
        action: 'REMOVE_STAFF',
        targetId: id,
        changesDiff: { targetEmail: targetUser.email, targetRole: targetUser.role },
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        message: `Staff member '${targetUser.name}' access has been permanently revoked.`,
      });
    }
  );
};
