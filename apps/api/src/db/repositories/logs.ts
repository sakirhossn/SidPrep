import { query } from '../pool.js';
import type { AuditEventRecord, OperationalEventRecord, AppTelemetryRecord } from '../index.js';

export class AuditEventRepository extends Array<AuditEventRecord> {
  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 500');
      this.length = 0;
      for (const row of res.rows) {
        const event: AuditEventRecord = {
          id: row.id,
          actorId: row.actor_id,
          actorEmail: row.actor_email,
          actorRole: row.actor_role,
          module: row.module,
          action: row.action,
          targetId: row.target_id || undefined,
          changesDiff: typeof row.changes_diff === 'string' ? JSON.parse(row.changes_diff) : row.changes_diff || {},
          ipAddress: row.ip_address || undefined,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        };
        super.push(event);
      }
    } catch (err: any) {
      console.error('[AuditEventRepository] Error loading from DB:', err.message);
    }
  }

  public override unshift(...items: AuditEventRecord[]): number {
    const res = super.unshift(...items);
    for (const item of items) {
      query(
        `INSERT INTO audit_events (
          id, actor_id, actor_email, actor_role, module, action, target_id, changes_diff, ip_address, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          item.id,
          item.actorId,
          item.actorEmail,
          item.actorRole,
          item.module,
          item.action,
          item.targetId || null,
          JSON.stringify(item.changesDiff || {}),
          item.ipAddress || null,
          item.createdAt,
        ]
      ).catch((err) => {
        console.error('[AuditEventRepository] Error inserting audit event:', err);
      });
    }
    return res;
  }
}

export class OperationalEventRepository extends Array<OperationalEventRecord> {
  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>('SELECT * FROM operational_events ORDER BY created_at DESC LIMIT 1000');
      this.length = 0;
      for (const row of res.rows) {
        const event: OperationalEventRecord = {
          id: row.id,
          service: row.service,
          level: (row.level as any) || 'INFO',
          message: row.message,
          meta: typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta || {},
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        };
        super.push(event);
      }
    } catch (err: any) {
      console.error('[OperationalEventRepository] Error loading from DB:', err.message);
    }
  }

  public override unshift(...items: OperationalEventRecord[]): number {
    const res = super.unshift(...items);
    // Keep bounded in memory
    if (this.length > 1000) {
      this.pop();
    }
    for (const item of items) {
      query(
        `INSERT INTO operational_events (
          id, service, level, message, meta, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [item.id, item.service, item.level, item.message, JSON.stringify(item.meta || {}), item.createdAt]
      ).catch((err) => {
        console.error('[OperationalEventRepository] Error inserting operational event:', err);
      });
    }
    return res;
  }
}

export class AppTelemetryRepository extends Array<AppTelemetryRecord> {
  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>('SELECT * FROM app_telemetry_events ORDER BY created_at DESC LIMIT 1000');
      this.length = 0;
      for (const row of res.rows) {
        const event: AppTelemetryRecord = {
          id: row.id,
          appVersion: row.app_version,
          os: (row.os as any) || 'android',
          eventCode: row.event_code,
          correlationId: row.correlation_id,
          sanitizedMetadata:
            typeof row.sanitized_metadata === 'string' ? JSON.parse(row.sanitized_metadata) : row.sanitized_metadata || {},
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        };
        super.push(event);
      }
    } catch (err: any) {
      console.error('[AppTelemetryRepository] Error loading from DB:', err.message);
    }
  }

  public override unshift(...items: AppTelemetryRecord[]): number {
    const res = super.unshift(...items);
    for (const item of items) {
      query(
        `INSERT INTO app_telemetry_events (
          id, app_version, os, event_code, correlation_id, sanitized_metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          item.id,
          item.appVersion,
          item.os,
          item.eventCode,
          item.correlationId,
          JSON.stringify(item.sanitizedMetadata || {}),
          item.createdAt,
        ]
      ).catch((err) => {
        console.error('[AppTelemetryRepository] Error inserting app telemetry:', err);
      });
    }
    return res;
  }
}
