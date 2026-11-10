import { buildServer } from './server.js';
import { env } from './config/index.js';
import { worker } from './worker/index.js';
import { runMigrations } from './db/migrate.js';
import { db } from './db/index.js';
import { closePool } from './db/pool.js';

async function main() {
  try {
    // 1. Gated Database Startup: Apply migrations and load data layer before accepting traffic
    console.log('[API] Initializing PostgreSQL data layer & applying pending migrations...');
    await runMigrations();
    await db.init();

    const app = await buildServer();
    const address = await app.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`[API] SidPrep 2.0 API Server running at ${address}/v1`);
    console.log(`[API] Environment: ${env.NODE_ENV} | Timezone: ${env.NEWS_TIMEZONE}`);

    // 2. Start background worker
    worker.start();

    // 3. Graceful Shutdown Hooks
    const closeGracefully = async (signal: string) => {
      console.log(`[API] Received ${signal}. Shutting down cleanly...`);
      worker.stop();
      await app.close();
      await closePool();
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
