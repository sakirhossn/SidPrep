import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/index.js';
import { requireAdminAuth } from '../../lib/adminAuth.js';
import { TelemetryBatchSchema } from '@sidprep/contracts';

/**
 * Recursively sanitize and redact sensitive credentials and PII from telemetry data (F31)
 */
export function redactTelemetryMetadata(input: any): any {
  if (input === null || input === undefined) return input;
  if (typeof input !== 'object') return input;

  if (Array.isArray(input)) {
    return input.map((item) => redactTelemetryMetadata(item));
  }

  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(input)) {
    const lowerKey = key.toLowerCase();
    if (val === null || val === undefined) {
      result[key] = val;
    } else if (typeof val === 'object') {
      if (
        lowerKey === 'password' ||
        lowerKey === 'token' ||
        lowerKey === 'otp' ||
        lowerKey === 'jwt' ||
        lowerKey === 'authheader' ||
        lowerKey === 'authorization'
      ) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactTelemetryMetadata(val);
      }
    } else if (
      lowerKey.includes('password') ||
      lowerKey.includes('token') ||
      lowerKey.includes('otp') ||
      lowerKey.includes('jwt') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('auth') ||
      lowerKey.includes('cookie') ||
      lowerKey.includes('credential')
    ) {
      result[key] = '[REDACTED]';
    } else if (lowerKey.includes('email') && typeof val === 'string') {
      result[key] = val.replace(/(.{2})(.*)(@.*)/, '$1***$3');
    } else if (lowerKey.includes('phone') && typeof val === 'string') {
      result[key] = val.replace(/(\d{2})(\d+)(\d{2})/, '$1******$3');
    } else {
      result[key] = val;
    }
  }
  return result;
}

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
      // INVARIANT F31: Recursive deep sanitization of all telemetry metadata
      const sanitized = redactTelemetryMetadata(ev.metadata || {});

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
  fastify.get('/admin/logs/audit', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'AUDITOR'])] }, async (request, reply) => {
    const { module, action, search, startDate, endDate, limit = '50' } = request.query as {
      module?: string;
      action?: string;
      search?: string;
      startDate?: string;
      endDate?: string;
      limit?: string;
    };
    const lim = Math.max(1, Math.min(200, parseInt(limit, 10)));

    let logs = [...db.auditEvents];

    if (module) {
      logs = logs.filter((l) => l.module.toLowerCase() === module.toLowerCase());
    }

    if (action) {
      logs = logs.filter((l) => l.action.toLowerCase() === action.toLowerCase());
    }

    if (startDate) {
      const startMs = new Date(startDate).getTime();
      logs = logs.filter((l) => new Date(l.createdAt).getTime() >= startMs);
    }

    if (endDate) {
      const endMs = new Date(endDate).getTime();
      logs = logs.filter((l) => new Date(l.createdAt).getTime() <= endMs);
    }

    if (search) {
      const q = search.toLowerCase();
      logs = logs.filter(
        (l) =>
          l.actorEmail?.toLowerCase().includes(q) ||
          l.action?.toLowerCase().includes(q) ||
          l.module?.toLowerCase().includes(q) ||
          l.targetId?.toLowerCase().includes(q)
      );
    }

    return reply.send(logs.slice(0, lim));
  });

  /**
   * GET /admin/logs/operational
   * Layer 2: Operational health, cron jobs, API latency
   */
  fastify.get('/admin/logs/operational', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'AUDITOR'])] }, async (request, reply) => {
    const { service, level, search, startDate, endDate, limit = '100' } = request.query as {
      service?: string;
      level?: string;
      search?: string;
      startDate?: string;
      endDate?: string;
      limit?: string;
    };
    const lim = Math.max(1, Math.min(200, parseInt(limit, 10)));
    let logs = [...db.operationalEvents];

    if (service) {
      logs = logs.filter((l) => l.service.toLowerCase() === service.toLowerCase());
    }

    if (level) {
      logs = logs.filter((l) => l.level.toUpperCase() === level.toUpperCase());
    }

    if (startDate) {
      const startMs = new Date(startDate).getTime();
      logs = logs.filter((l) => new Date(l.createdAt).getTime() >= startMs);
    }

    if (endDate) {
      const endMs = new Date(endDate).getTime();
      logs = logs.filter((l) => new Date(l.createdAt).getTime() <= endMs);
    }

    if (search) {
      const q = search.toLowerCase();
      logs = logs.filter(
        (l) => l.service.toLowerCase().includes(q) || l.message.toLowerCase().includes(q)
      );
    }

    return reply.send(logs.slice(0, lim));
  });

  /**
   * GET /admin/logs/telemetry
   * Layer 3: Filterable student app telemetry
   */
  fastify.get('/admin/logs/telemetry', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'ANALYST', 'AUDITOR'])] }, async (request, reply) => {
    const { os, eventCode, search, startDate, endDate, limit = '100' } = request.query as {
      os?: string;
      eventCode?: string;
      search?: string;
      startDate?: string;
      endDate?: string;
      limit?: string;
    };
    const lim = Math.max(1, Math.min(200, parseInt(limit, 10)));
    let logs = [...db.appTelemetry];

    if (os) {
      logs = logs.filter((l) => l.os.toLowerCase() === os.toLowerCase());
    }

    if (eventCode) {
      logs = logs.filter((l) => l.eventCode.toLowerCase().includes(eventCode.toLowerCase()));
    }

    if (startDate) {
      const startMs = new Date(startDate).getTime();
      logs = logs.filter((l) => new Date(l.createdAt).getTime() >= startMs);
    }

    if (endDate) {
      const endMs = new Date(endDate).getTime();
      logs = logs.filter((l) => new Date(l.createdAt).getTime() <= endMs);
    }

    if (search) {
      const q = search.toLowerCase();
      logs = logs.filter(
        (l) =>
          l.eventCode.toLowerCase().includes(q) ||
          l.appVersion?.toLowerCase().includes(q) ||
          l.correlationId?.toLowerCase().includes(q)
      );
    }

    return reply.send(logs.slice(0, lim));
  });

  /**
   * POST /admin/logs/purge
   * Purge old operational or telemetry logs past retention threshold
   * Strict invariant: Audit logs are append-only and cannot be purged
   */
  fastify.post('/admin/logs/purge', { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] }, async (request, reply) => {
    const admin = request.admin!;
    const body = (request.body || {}) as {
      layer?: 'operational' | 'telemetry' | 'both';
      olderThanDays?: number;
    };

    const days = typeof body.olderThanDays === 'number' ? Math.max(1, body.olderThanDays) : 30;
    const cutoffMs = Date.now() - days * 86400000;
    const targetLayer = body.layer || 'both';

    let purgedCount = 0;

    if (targetLayer === 'operational' || targetLayer === 'both') {
      const remaining = db.operationalEvents.filter(
        (l) => new Date(l.createdAt).getTime() > cutoffMs
      );
      purgedCount += db.operationalEvents.length - remaining.length;
      db.operationalEvents.splice(0, db.operationalEvents.length, ...remaining);
    }

    if (targetLayer === 'telemetry' || targetLayer === 'both') {
      const remaining = db.appTelemetry.filter(
        (l) => new Date(l.createdAt).getTime() > cutoffMs
      );
      purgedCount += db.appTelemetry.length - remaining.length;
      db.appTelemetry.splice(0, db.appTelemetry.length, ...remaining);
    }

    db.logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'LOG_MANAGEMENT',
      action: 'PURGE_SYSTEM_LOGS',
      targetId: targetLayer,
      changesDiff: { targetLayer, olderThanDays: days, purgedCount },
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      targetLayer,
      purgedCount,
      message: `Successfully purged ${purgedCount} log records older than ${days} days. Audit trail remained untouched.`,
    });
  });
};
