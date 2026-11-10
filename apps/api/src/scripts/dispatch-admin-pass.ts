import { db } from '../db/index.js';
import { generateRandomPassword, hashPassword, generateTotpSecret } from '../lib/security.js';
import { sendAdminCredentialsEmail } from '../lib/email.js';

async function main() {
  const targetEmail = process.env.ADMIN_EMAIL || 'sksakirhossain8@gmail.com';
  console.log(`[Admin Dispatch] Initializing system-generated password for: ${targetEmail}`);

  // 1. Generate secure password
  const newPassword = generateRandomPassword(14);
  const newPasswordHash = await hashPassword(newPassword);

  // 2. Find or create admin user in DB
  const existingAdmin = Array.from(db.adminUsers.values()).find(
    (a) => a.email.toLowerCase() === targetEmail.toLowerCase()
  );

  if (existingAdmin) {
    existingAdmin.passwordHash = newPasswordHash;
    console.log(`[Admin Dispatch] Updated password hash for admin user ID: ${existingAdmin.id}`);
  } else {
    db.adminUsers.set('adm_1', {
      id: 'adm_1',
      email: targetEmail,
      name: 'Sk Sakir Hossain',
      passwordHash: newPasswordHash,
      role: 'SUPER_ADMIN',
      totpSecret: generateTotpSecret(),
      is2faEnabled: true,
      isActive: true,
      createdAt: new Date().toISOString(),
    });
    console.log(`[Admin Dispatch] Created new super admin record adm_1`);
  }

  // 3. Persist password hash to database
  if (existingAdmin) {
    await db.adminUsers.set(existingAdmin.id, existingAdmin);
  }

  // 4. Send email via Brevo (single-use delivery, never persisted to disk)
  const emailResult = await sendAdminCredentialsEmail(targetEmail, newPassword);

  // 5. Output summary
  console.log('\n' + '='.repeat(64));
  console.log('       SIDPREP 2.0 ADMIN CREDENTIALS INITIALIZED');
  console.log('='.repeat(64));
  console.log(` Staff Email:        ${targetEmail}`);
  console.log(` Generated Password: ${newPassword}`);
  console.log(` 2FA Seed Code:      123456`);
  console.log(` Brevo Email Status: ${emailResult.success ? 'DISPATCHED' : `FAILED (${emailResult.error})`}`);
  if (!emailResult.success && emailResult.error?.includes('525')) {
    console.log('\n[Brevo Note] Brevo IP Authorization is active on your account.');
    console.log('To allow your server to send emails, add your server IP in Brevo:');
    console.log('Brevo Dashboard -> Settings -> Security -> Authorized IPs');
  }
  console.log(` Admin URL:          https://sidprep.in/admin/login`);
  console.log('='.repeat(64) + '\n');
}

main().catch((err) => {
  console.error('[Admin Dispatch] Fatal error:', err);
  process.exit(1);
});
