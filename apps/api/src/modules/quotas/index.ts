import type { FastifyPluginAsync } from 'fastify';
import os from 'node:os';
import { db } from '../../db/index.js';
import { checkHealth } from '../../db/pool.js';
import { env } from '../../config/index.js';
import { requireAdminAuth } from '../../lib/adminAuth.js';

export const quotaRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /health
   * Public health check and service readiness endpoint
   */
  fastify.get('/health', async (_request, reply) => {
    const memoryUsage = process.memoryUsage();
    const dbHealth = await checkHealth();
    const isHealthy = dbHealth.status === 'healthy';
    const emailQuota = await db.getEmailQuotaUsage('brevo');

    const statusCode = isHealthy ? 200 : 503;
    return reply.code(statusCode).send({
      status: isHealthy ? 'healthy' : 'degraded',
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: {
        database: isHealthy ? 'connected' : 'disconnected',
        databaseEngine: dbHealth.mode,
        worker: 'active',
        storage: env.STORAGE_DRIVER,
        brevoQuota: {
          usedToday: emailQuota.usedToday,
          limit: emailQuota.limit,
          remainingToday: emailQuota.remaining,
          dateIst: emailQuota.dateIst,
          warnThreshold: env.BREVO_DAILY_QUOTA_WARN_THRESHOLD,
          status: emailQuota.usedToday >= emailQuota.limit ? 'EXHAUSTED' : 'OPERATIONAL',
        },
      },
      process: {
        rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      },
    });
  });

  /**
   * GET /admin/quotas
   * Free-tier cost controls and resource utilization dashboard
   * Protected: Requires staff authentication
   */
  fastify.get(
    '/admin/quotas',
    { preHandler: [requireAdminAuth()] },
    async (_request, reply) => {
      const totalMemBytes = os.totalmem();
      const freeMemBytes = os.freemem();
      const usedMemMb = Math.round((totalMemBytes - freeMemBytes) / 1024 / 1024);
      const totalMemMb = Math.round(totalMemBytes / 1024 / 1024);

      // Calculate approximate storage used by seeded resources
      const totalResourceBytes = Array.from(db.resources.values()).reduce(
        (sum, r) => sum + r.fileSizeBytes,
        0
      );

      const emailQuota = await db.getEmailQuotaUsage('brevo');

      return reply.send({
        oracleCloud: {
          instanceType: 'Ampere A1 Compute (ARM64)',
          allocatedCpus: 2,
          allocatedMemoryMb: 12288, // 12 GB
          currentMemoryUsedMb: usedMemMb,
          currentMemoryTotalMb: totalMemMb,
          allocatedDiskGb: 200,
          estimatedDiskUsedGb: 14.5,
          status: 'WITHIN_FREE_ALLOWANCE',
        },
        brevoEmail: {
          dailyQuota: emailQuota.limit,
          usedToday: emailQuota.usedToday,
          remainingToday: emailQuota.remaining,
          dateIst: emailQuota.dateIst,
          resetsAtUTC: '18:30:00Z', // 00:00:00 IST = 18:30:00 UTC previous day
          safetyBufferPct: 15,
        },
        cloudflareR2: {
          driver: env.STORAGE_DRIVER,
          bucket: env.R2_BUCKET_NAME,
          publicDomain: env.R2_PUBLIC_DOMAIN,
          monthlyFreeAllowanceGb: 10,
          usedBytes: totalResourceBytes,
          usedMb: Math.round((totalResourceBytes / 1024 / 1024) * 100) / 100,
          status: 'WITHIN_FREE_ALLOWANCE',
        },
      });
    }
  );
};
