import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import crypto from 'node:crypto';
import { env } from './config/index.js';
import { authRoutes } from './modules/auth/index.js';
import { examRoutes } from './modules/exams/index.js';
import { testRoutes } from './modules/tests/index.js';
import { newsRoutes } from './modules/news/index.js';
import { resourceRoutes } from './modules/resources/index.js';
import { userRoutes } from './modules/users/index.js';
import { logRoutes } from './modules/logs/index.js';
import { quotaRoutes } from './modules/quotas/index.js';
import { adminRoutes } from './modules/admin/index.js';

export async function buildServer() {
  const app = fastify({
    logger: env.NODE_ENV !== 'test',
    genReqId: () => `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
  });

  // Plugins
  await app.register(sensible);

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow localhost and configured origins
      if (!origin || env.CORS_ALLOWED_ORIGINS.split(',').includes(origin) || origin.includes('localhost')) {
        return cb(null, true);
      }
      return cb(new Error('CORS Not Allowed'), false);
    },
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://api.sidprep.in', 'https://sidprep.in'],
      },
    },
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
  });

  // Global correlation ID header
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // Register All Modular API Routes under /v1
  await app.register(
    async (v1) => {
      await v1.register(quotaRoutes);
      await v1.register(authRoutes);
      await v1.register(examRoutes);
      await v1.register(testRoutes);
      await v1.register(newsRoutes);
      await v1.register(resourceRoutes);
      await v1.register(userRoutes);
      await v1.register(logRoutes);
      await v1.register(adminRoutes);
    },
    { prefix: '/v1' }
  );

  return app;
}
