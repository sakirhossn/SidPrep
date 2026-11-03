import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/index.js';
import { verifyJwt } from '../../lib/security.js';
import { TelemetryBatchSchema } from '@sidprep/contracts';

export const logRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /telemetry
   * Student mobile app telemetry ingestion (batched, sanitized)
   */
  fastify.post('/telemetry', async (request, reply) => {
    const parse = TelemetryBatchSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_TELEMETRY', details: parse.error.format() } });
    }

    const { appVersion, os, events } = parse.data;

    for (const ev of events) {
      // Ensure zero PII or credentials in logs
      const sanitized = { ...(ev.metadata || {}) };
      delete sanitized.password;
      delete sanitized.token;
      delete sanitized.otp;
      delete sanitized.jwt;
      delete sanitized.email;

      db.appTelemetry.unshift({
        id: `tel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        appVersion,
        os,
        eventCode: ev.eventCode,
        correlationId: ev.correlationId,
        sanitizedMetadata: sanitized,
        createdAt: ev.timestamp || new Date().toISOString(),
      });
    }

    // Keep bounded in memory
    if (db.appTelemetry.length > 500) {
      db.appTelemetry.splice(500);
    }

    return reply.code(202).send({ success: true, acceptedCount: events.length });
  });

  /**
   * GET /admin/logs/audit
   * Layer 1: Immutable append-only audit logs
   */
  fastify.get('/admin/logs/audit', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Admin login required' } });
    }

    const token = authHeader.substring(7);
    const admin = verifyJwt<{ sub: string; email: string; role: string }>(token);
    if (!admin || !['SUPER_ADMIN', 'AUDITOR'].includes(admin.role)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Auditor or Super Admin role required' } });
    }

    const { module, action, limit = '50' } = request.query as { module?: string; action?: string; limit?: string };
    const lim = Math.max(1, Math.min(200, parseInt(limit, 10)));

    let logs = [...db.auditEvents];

    if (module) {
      logs = logs.filter((l) => l.module.toLowerCase() === module.toLowerCase());
    }

    if (action) {
      logs = logs.filter((l) => l.action.toLowerCase() === action.toLowerCase());
    }

    return reply.send(logs.slice(0, lim));
  });

  /**
   * GET /admin/logs/operational
   * Layer 2: Operational health, cron jobs, API latency
   */
  fastify.get('/admin/logs/operational', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Admin login required' } });
    }

    const token = authHeader.substring(7);
    const admin = verifyJwt<{ sub: string; email: string; role: string }>(token);
    if (!admin) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin login required' } });
    }

    const { service, level } = request.query as { service?: string; level?: string };
    let logs = [...db.operationalEvents];

    if (service) {
      logs = logs.filter((l) => l.service.toLowerCase() === service.toLowerCase());
    }

    if (level) {
      logs = logs.filter((l) => l.level.toUpperCase() === level.toUpperCase());
    }

    return reply.send(logs.slice(0, 100));
  });

  /**
   * GET /admin/logs/telemetry
   * Layer 3: Filterable student app telemetry
   */
  fastify.get('/admin/logs/telemetry', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Admin login required' } });
    }

    const { os, eventCode } = request.query as { os?: string; eventCode?: string };
    let logs = [...db.appTelemetry];

    if (os) {
      logs = logs.filter((l) => l.os.toLowerCase() === os.toLowerCase());
    }

    if (eventCode) {
      logs = logs.filter((l) => l.eventCode.toLowerCase().includes(eventCode.toLowerCase()));
    }

    return reply.send(logs.slice(0, 100));
  });
};
