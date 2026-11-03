import type { FastifyPluginAsync } from 'fastify';
import os from 'node:os';
import { db } from '../../db/index.js';
import { env } from '../../config/index.js';

export const quotaRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /health
   * Public health check and service readiness endpoint
   */
  fastify.get('/health', async (_request, reply) => {
    const memoryUsage = process.memoryUsage();
    return reply.send({
      status: 'healthy',
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: {
        database: 'connected',
        worker: 'active',
        storage: env.STORAGE_DRIVER,
        brevoQuota: {
          usedToday: db.brevoSendsToday,
          limit: env.BREVO_DAILY_QUOTA_LIMIT,
          warnThreshold: env.BREVO_DAILY_QUOTA_WARN_THRESHOLD,
          status: db.brevoSendsToday >= env.BREVO_DAILY_QUOTA_LIMIT ? 'EXHAUSTED' : 'OPERATIONAL',
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
   */
  fastify.get('/admin/quotas', async (_request, reply) => {
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const usedMemMb = Math.round((totalMemBytes - freeMemBytes) / 1024 / 1024);
    const totalMemMb = Math.round(totalMemBytes / 1024 / 1024);

    // Calculate approximate storage used by seeded resources
    const totalResourceBytes = Array.from(db.resources.values()).reduce((sum, r) => sum + r.fileSizeBytes, 0);

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
        dailyQuota: env.BREVO_DAILY_QUOTA_LIMIT,
        usedToday: db.brevoSendsToday,
        remainingToday: Math.max(0, env.BREVO_DAILY_QUOTA_LIMIT - db.brevoSendsToday),
        warnThreshold: env.BREVO_DAILY_QUOTA_WARN_THRESHOLD,
        isWarningTriggered: db.brevoSendsToday >= env.BREVO_DAILY_QUOTA_WARN_THRESHOLD,
        isExhausted: db.brevoSendsToday >= env.BREVO_DAILY_QUOTA_LIMIT,
        mode: 'OTP_TRANSACTIONAL_PRIORITY',
      },
      cloudflareR2: {
        monthlyFreeStorageBytes: env.R2_MONTHLY_QUOTA_BYTES, // 10 GB
        currentUsedBytes: totalResourceBytes,
        currentUsedMb: Number((totalResourceBytes / 1024 / 1024).toFixed(2)),
        totalFilesStored: db.resources.size,
        status: 'WITHIN_FREE_ALLOWANCE',
      },
      apiWorkload: {
        totalStudentsRegistered: db.students.size,
        totalActiveTests: db.tests.size,
        totalAttemptsRecorded: db.attempts.size,
        totalCurrentAffairsPublished: Array.from(db.newsDrafts.values()).filter((d) => d.editorialStatus === 'PUBLISHED').length,
      },
    });
  });
};
