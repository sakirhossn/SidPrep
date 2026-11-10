import { db } from '../db/index.js';
import { hashPassword, generateRandomPassword, generateTotpSecret } from '../lib/security.js';
import { closePool } from '../db/pool.js';

/**
 * Official SidPrep 2.0 Bootstrap Administrator CLI
 * One-time safe initialization for root administrator.
 * Invariant F02: Never re-seeds or installs predictable credentials automatically.
 */
async function bootstrapAdmin() {
  console.log('[Bootstrap] Initializing database connection...');
  await db.init();

  const args = process.argv.slice(2);
  const force = args.includes('--force');

  // Check if active super admin already exists
  const existingSuperAdmins = Array.from(db.adminUsers.values()).filter(
    (u) => u.role === 'SUPER_ADMIN' && u.isActive
  );

  if (existingSuperAdmins.length > 0 && !force) {
    console.warn(
      `[Bootstrap] An active SUPER_ADMIN already exists (${existingSuperAdmins.map((u) => u.email).join(', ')}).`
    );
    console.warn('[Bootstrap] To overwrite or re-bootstrap, pass the --force flag.');
    await closePool();
    process.exit(0);
  }

  const targetEmail = (
    process.env.ADMIN_EMAIL ||
    args.find((a) => a.includes('@')) ||
    'admin@sidprep.in'
  ).trim().toLowerCase();

  const generatedPassword = generateRandomPassword(16);
  const passwordHash = await hashPassword(generatedPassword);
  const totpSecret = generateTotpSecret();

  const adminId = 'adm_owner';
  const adminRecord = {
    id: adminId,
    email: targetEmail,
    name: 'Root Administrator',
    passwordHash,
    role: 'SUPER_ADMIN' as const,
    totpSecret,
    is2faEnabled: true,
    isActive: true,
    tokenVersion: 1,
    createdAt: new Date().toISOString(),
  };

  await db.adminUsers.set(adminId, adminRecord);
  await db.adminUsers.flush();

  console.log('\n======================================================');
  console.log('✅ SIDPREP 2.0 ROOT ADMINISTRATOR BOOTSTRAP SUCCESS');
  console.log('======================================================');
  console.log(`Administrator ID : ${adminId}`);
  console.log(`Email Address    : ${targetEmail}`);
  console.log(`Generated Password: ${generatedPassword}`);
  console.log(`TOTP Secret Key  : ${totpSecret}`);
  console.log('------------------------------------------------------');
  console.log('⚠️  Store these credentials securely. The password cannot be recovered');
  console.log('    in plaintext from the database.');
  console.log('======================================================\n');

  await closePool();
}

bootstrapAdmin().catch(async (err) => {
  console.error('[Bootstrap] Failed to bootstrap administrator:', err);
  await closePool();
  process.exit(1);
});
