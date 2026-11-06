import { db } from '../db/index.js';
import { generateRandomPassword, hashPassword } from '../lib/security.js';
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
      totpSecret: 'JBSWY3DPEHPK3PXP',
      is2faEnabled: true,
      isActive: true,
      createdAt: new Date().toISOString(),
    });
    console.log(`[Admin Dispatch] Created new super admin record adm_1`);
  }

  // 3. Persist credentials to disk across candidate paths
  const credPaths = [
    process.env.ADMIN_CREDS_FILE,
    './admin_credentials.json',
    '/app/admin_credentials.json',
    './apps/api/uploads/admin_credentials.json',
    '/app/apps/api/uploads/admin_credentials.json',
    './uploads/admin_credentials.json',
  ].filter(Boolean) as string[];

  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const payload = JSON.stringify(
      {
        email: targetEmail,
        password: newPassword,
        passwordHash: newPasswordHash,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    );

    for (const cp of credPaths) {
      try {
        const dir = path.dirname(cp);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(cp, payload, 'utf8');
        console.log(`[Admin Dispatch] Persisted credentials to disk at: ${cp}`);
      } catch {}
    }

    // Also update ADMIN_PASSWORD in .env if present
    const envPaths = ['./.env', '../.env', '../../.env', '/opt/sidprep/.env'];
    for (const ep of envPaths) {
      try {
        if (fs.existsSync(ep)) {
          let envContent = fs.readFileSync(ep, 'utf8');
          if (envContent.includes('ADMIN_PASSWORD=')) {
            envContent = envContent.replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${newPassword}`);
          } else {
            envContent += `\nADMIN_PASSWORD=${newPassword}\n`;
          }
          fs.writeFileSync(ep, envContent, 'utf8');
          console.log(`[Admin Dispatch] Synced ADMIN_PASSWORD in: ${ep}`);
        }
      } catch {}
    }
  } catch (fsErr: any) {
    console.warn(`[Admin Dispatch] Could not persist to disk: ${fsErr.message}`);
  }

  // 4. Send email via Brevo
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
