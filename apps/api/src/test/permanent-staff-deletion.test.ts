import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { query, closePool } from '../db/pool.js';
import { signJwt } from '../lib/security.js';

describe('Requirement 6: Permanent Staff Deletion with Step-Up MFA & Audit Tombstones', () => {
  let app: any;
  let superAdminTokenFresh: string;
  let superAdminTokenStale: string;
  let reviewerToken: string;

  const superAdmin1Id = `adm_sa1_${Date.now()}`;
  const superAdmin2Id = `adm_sa2_${Date.now()}`;
  const targetStaffId = `adm_target_${Date.now()}`;

  before(async () => {
    app = await buildServer();
    await app.ready();

    // 1. Super Admin 1 (with fresh MFA)
    await db.adminUsers.set(superAdmin1Id, {
      id: superAdmin1Id,
      name: 'Primary Super Admin',
      email: `sa1_${Date.now()}@sidprep.in`,
      passwordHash: 'dummy_hash',
      role: 'SUPER_ADMIN',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      is2faEnabled: true,
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });

    // 2. Super Admin 2 (second active Super Admin)
    await db.adminUsers.set(superAdmin2Id, {
      id: superAdmin2Id,
      name: 'Secondary Super Admin',
      email: `sa2_${Date.now()}@sidprep.in`,
      passwordHash: 'dummy_hash',
      role: 'SUPER_ADMIN',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      is2faEnabled: true,
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });

    // 3. Target Staff Member to be deleted
    await db.adminUsers.set(targetStaffId, {
      id: targetStaffId,
      name: 'Retiring Reviewer',
      email: `retiring_${Date.now()}@sidprep.in`,
      passwordHash: 'dummy_hash',
      role: 'REVIEWER',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      is2faEnabled: true,
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });

    // Seed trusted device for target staff
    await query(`
      INSERT INTO admin_trusted_devices (
        id, admin_id, token_hash, device_label, user_agent, ip_address, expires_at, created_at, last_used_at
      ) VALUES (
        $1, $2, 'dummy_token_hash_target', 'Staff Laptop', 'Mozilla/5.0', '192.168.1.50',
        NOW() + INTERVAL '7 days', NOW(), NOW()
      )
    `, [`dev_${Date.now()}`, targetStaffId]);

    // Seed audit event by target staff
    await query(`
      INSERT INTO audit_events (
        id, actor_id, actor_email, actor_role, module, action, target_id, changes_diff, ip_address, created_at
      ) VALUES (
        $1, $2, $3, 'REVIEWER', 'QUESTION_BANK', 'APPROVE_QUESTION', 'q_100', '{"approved": true}'::jsonb, '127.0.0.1', NOW()
      )
    `, [`ae_${Date.now()}`, targetStaffId, `retiring_${Date.now()}@sidprep.in`]);

    // Fresh MFA token (mfaVerifiedAt is now)
    superAdminTokenFresh = signJwt(
      {
        sub: superAdmin1Id,
        adminId: superAdmin1Id,
        email: `sa1_${Date.now()}@sidprep.in`,
        role: 'SUPER_ADMIN',
        type: 'admin_session',
        tokenVersion: 1,
        mfaVerifiedAt: Date.now(),
      },
      '1h'
    );

    // Stale MFA token (mfaVerifiedAt is 20 minutes ago)
    superAdminTokenStale = signJwt(
      {
        sub: superAdmin1Id,
        adminId: superAdmin1Id,
        email: `sa1_${Date.now()}@sidprep.in`,
        role: 'SUPER_ADMIN',
        type: 'admin_session',
        tokenVersion: 1,
        mfaVerifiedAt: Date.now() - 20 * 60 * 1000,
      },
      '1h'
    );

    // Reviewer token (unauthorized for deletion)
    reviewerToken = signJwt(
      {
        sub: targetStaffId,
        adminId: targetStaffId,
        email: `retiring_${Date.now()}@sidprep.in`,
        role: 'REVIEWER',
        type: 'admin_session',
        tokenVersion: 1,
      },
      '1h'
    );
  });

  after(async () => {
    await db.adminUsers.persistDelete(superAdmin1Id).catch(() => {});
    await db.adminUsers.persistDelete(superAdmin2Id).catch(() => {});
    await db.adminUsers.persistDelete(targetStaffId).catch(() => {});
    if (app) await app.close();
    await closePool();
  });

  it('6.1: Non-SuperAdmin is forbidden from inspecting consequences or deleting staff', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/team/${targetStaffId}/consequences`,
      headers: { Authorization: `Bearer ${reviewerToken}` },
    });
    assert.equal(res.statusCode, 403);
  });

  it('6.2: GET /v1/admin/team/:id/consequences returns live counts and warnings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/team/${targetStaffId}/consequences`,
      headers: { Authorization: `Bearer ${superAdminTokenFresh}` },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.member.id, targetStaffId);
    assert.equal(body.data.trustedDevicesCount, 1);
    assert.equal(body.data.auditEventsCount, 1);
    assert.equal(body.data.isLastSuperAdmin, false);
    assert.ok(Array.isArray(body.data.consequences));
    assert.ok(body.data.consequences.length >= 4);
  });

  it('6.3: Consequence inspection detects last active Super Admin', async () => {
    // Temporarily deactivate all other active super admins
    const otherSuperAdmins = Array.from(db.adminUsers.values()).filter(
      (u) => u.id !== superAdmin1Id && u.role === 'SUPER_ADMIN' && u.isActive
    );

    for (const admin of otherSuperAdmins) {
      admin.isActive = false;
      await db.adminUsers.set(admin.id, admin);
    }

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/team/${superAdmin1Id}/consequences`,
      headers: { Authorization: `Bearer ${superAdminTokenFresh}` },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.isLastSuperAdmin, true, 'Sole active Super Admin must be flagged');

    // Restore other super admins
    for (const admin of otherSuperAdmins) {
      admin.isActive = true;
      await db.adminUsers.set(admin.id, admin);
    }
  });

  it('6.4: Permanent deletion without fresh MFA is rejected with HTTP 428', async () => {
    const targetUser = db.adminUsers.get(targetStaffId)!;
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/team/${targetStaffId}/permanent`,
      headers: { Authorization: `Bearer ${superAdminTokenStale}` },
      payload: {
        confirmEmail: targetUser.email,
        reason: 'Staff member resignation and GDPR right to erasure request',
      },
    });

    assert.equal(res.statusCode, 428);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'STEP_UP_MFA_REQUIRED');
  });

  it('6.5: Permanent deletion with mismatched confirmation email is rejected', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/team/${targetStaffId}/permanent`,
      headers: { Authorization: `Bearer ${superAdminTokenFresh}` },
      payload: {
        confirmEmail: 'wrong_email@sidprep.in',
        reason: 'Staff member resignation and GDPR right to erasure request',
      },
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'CONFIRMATION_EMAIL_MISMATCH');
  });

  it('6.6: Transactional permanent deletion purges PostgreSQL record, cascades tokens & logs tombstone', async () => {
    const targetUser = db.adminUsers.get(targetStaffId)!;

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/team/${targetStaffId}/permanent`,
      headers: { Authorization: `Bearer ${superAdminTokenFresh}` },
      payload: {
        confirmEmail: targetUser.email,
        reason: 'Staff member resignation and GDPR right to erasure request',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(body.tombstoneId);

    // 1. PostgreSQL record must be completely deleted
    const dbAdminRes = await query('SELECT * FROM admin_users WHERE id = $1', [targetStaffId]);
    assert.equal(dbAdminRes.rows.length, 0, 'admin_users record must be deleted from DB');

    // 2. In-memory cache must not contain user
    assert.equal(db.adminUsers.has(targetStaffId), false, 'Cache must not retain deleted staff');

    // 3. Trusted devices must be cascaded/deleted
    const tdRes = await query('SELECT * FROM admin_trusted_devices WHERE admin_id = $1', [targetStaffId]);
    assert.equal(tdRes.rows.length, 0, 'Trusted devices must be purged');

    // 4. Tombstone record exists
    const tombRes = await query('SELECT * FROM admin_deletion_tombstones WHERE deleted_admin_id = $1', [targetStaffId]);
    assert.equal(tombRes.rows.length, 1);
    assert.equal(tombRes.rows[0].id, body.tombstoneId);

    // 5. Past audit events updated to DELETED with attribution
    const aeRes = await query('SELECT actor_status, deleted_actor_ref FROM audit_events WHERE actor_id = $1', [targetStaffId]);
    assert.ok(aeRes.rows.length > 0);
    assert.equal(aeRes.rows[0].actor_status, 'DELETED');
    assert.equal(aeRes.rows[0].deleted_actor_ref.tombstone_id, body.tombstoneId);
  });

  it('6.7: User remains deleted after simulated restart (loadFromDb)', async () => {
    await db.adminUsers.loadFromDb();
    assert.equal(db.adminUsers.has(targetStaffId), false, 'Staff user must remain absent after reload');

    // Attempting login with deleted user token must fail (account not found -> 403 Forbidden)
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/team',
      headers: { Authorization: `Bearer ${reviewerToken}` },
    });
    assert.equal(res.statusCode, 403, 'Old session token for deleted staff must be rejected');
  });
});
