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

    // Load persisted admin credentials if available
    try {
      const fs = await import('node:fs');
      const credPath = process.env.ADMIN_CREDS_FILE || './admin_credentials.json';
      if (fs.existsSync(credPath)) {
        const { db } = await import('./db/index.js');
        const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
        const admin = Array.from(db.adminUsers.values()).find(
          (a) => a.email.toLowerCase() === creds.email?.toLowerCase()
        );
        if (admin && creds.passwordHash) {
          admin.passwordHash = creds.passwordHash;
          console.log(`[API] Restored admin password hash from ${credPath} for ${admin.email}`);
        }
      }
    } catch (fsErr: any) {
      console.warn(`[API] Could not check persisted credentials: ${fsErr.message}`);
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
