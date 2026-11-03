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
