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
