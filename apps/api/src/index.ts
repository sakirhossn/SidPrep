import { buildServer } from './server.js';
import { env } from './config/index.js';
import { worker } from './worker/index.js';

async function main() {
  try {
    const app = await buildServer();
    const address = await app.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`[API] SidPrep 2.0 API Server running at ${address}/v1`);
    console.log(`[API] Environment: ${env.NODE_ENV} | Timezone: ${env.NEWS_TIMEZONE}`);

    // Start background worker
    worker.start();

    // Auto-dispatch admin credentials on boot if requested
    if (process.env.ADMIN_DISPATCH_ON_BOOT === 'true') {
      try {
        const { db } = await import('./db/index.js');
        const { generateRandomPassword, hashPassword } = await import('./lib/security.js');
        const { sendAdminCredentialsEmail } = await import('./lib/email.js');
        const targetEmail = process.env.ADMIN_EMAIL || 'sksakirhossain8@gmail.com';
        const newPassword = generateRandomPassword(14);
        const newPasswordHash = await hashPassword(newPassword);
        const admin = Array.from(db.adminUsers.values()).find(
          (a) => a.email.toLowerCase() === targetEmail.toLowerCase()
        );
        if (admin) {
          admin.passwordHash = newPasswordHash;
        }
        await sendAdminCredentialsEmail(targetEmail, newPassword);
        console.log(`[API] Admin credentials auto-dispatched to: ${targetEmail} | Temp Pass: ${newPassword}`);
      } catch (dispatchErr: any) {
        console.warn(`[API] Admin auto-dispatch warning: ${dispatchErr.message}`);
      }
    }

    // Graceful Shutdown
    const closeGracefully = async (signal: string) => {
      console.log(`[API] Received ${signal}. Shutting down cleanly...`);
      worker.stop();
      await app.close();
      process.exit(0);
    };

    process.on('SIGINT', () => closeGracefully('SIGINT'));
    process.on('SIGTERM', () => closeGracefully('SIGTERM'));
  } catch (err) {
    console.error('[API] Fatal startup error:', err);
    process.exit(1);
  }
}

main();
