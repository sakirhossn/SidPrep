import { query, getClient } from '../pool.js';
import type { JobRunRecord } from '../index.js';

export class JobRepository extends Array<JobRunRecord> {
  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>('SELECT * FROM jobs ORDER BY scheduled_for ASC');
      this.length = 0;
      for (const row of res.rows) {
        const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload || {};
        const job: JobRunRecord = {
          id: row.id,
          jobType: row.job_type,
          payload,
          status: (row.status as any) || 'QUEUED',
          scheduledFor: row.scheduled_for ? new Date(row.scheduled_for).toISOString() : new Date().toISOString(),
          retryCount: Number(row.retry_count) || 0,
          lastError: row.last_error || undefined,
        };
        super.push(job);
      }
    } catch (err: any) {
      console.error('[JobRepository] Error loading from DB:', err.message);
    }
  }

  public override push(...items: JobRunRecord[]): number {
    const res = super.push(...items);
    for (const item of items) {
      query(
        `INSERT INTO jobs (
          id, job_type, payload, status, scheduled_for, retry_count, last_error, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          retry_count = EXCLUDED.retry_count,
          last_error = EXCLUDED.last_error`,
        [
          item.id,
          item.jobType,
          JSON.stringify(item.payload || {}),
          item.status,
          item.scheduledFor,
          item.retryCount,
          item.lastError || null,
        ]
      ).catch((err) => {
        console.error('[JobRepository] Error inserting job:', err);
      });
    }
    return res;
  }

  /**
   * Authoritative PostgreSQL FOR UPDATE SKIP LOCKED job claim
   */
  public async claimNextJob(): Promise<JobRunRecord | null> {
    try {
      const client = await getClient();
      try {
        const sql = `
          WITH claimed AS (
            SELECT id FROM jobs
            WHERE status = 'QUEUED' AND (scheduled_for IS NULL OR scheduled_for <= NOW())
            ORDER BY scheduled_for ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          UPDATE jobs
          SET status = 'RUNNING', started_at = NOW()
          FROM claimed
          WHERE jobs.id = claimed.id
          RETURNING jobs.*
        `;
        const res = await client.query(sql);
        if (res.rows && res.rows.length > 0) {
          const row = res.rows[0];
          const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload || {};
          const job: JobRunRecord = {
            id: row.id,
            jobType: row.job_type,
            payload,
            status: 'RUNNING',
            scheduledFor: row.scheduled_for ? new Date(row.scheduled_for).toISOString() : new Date().toISOString(),
            retryCount: Number(row.retry_count) || 0,
            lastError: row.last_error || undefined,
          };
          // Sync in-memory representation
          const idx = this.findIndex((j) => j.id === job.id);
          if (idx >= 0) {
            this[idx] = job;
          } else {
            super.push(job);
          }
          return job;
        }
        return null;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[JobRepository] Error claiming job with FOR UPDATE SKIP LOCKED:', err.message);
      return null;
    }
  }

  public async completeJob(id: string): Promise<void> {
    try {
      await query("UPDATE jobs SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1", [id]);
      const job = this.find((j) => j.id === id);
      if (job) job.status = 'COMPLETED';
    } catch (err: any) {
      console.error(`[JobRepository] Error completing job ${id}:`, err.message);
    }
  }

  public async enqueue(item: JobRunRecord): Promise<boolean> {
    try {
      const res = await query(
        `INSERT INTO jobs (
          id, job_type, payload, status, scheduled_for, retry_count, last_error, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (id) DO NOTHING`,
        [
          item.id,
          item.jobType,
          JSON.stringify(item.payload || {}),
          item.status || 'QUEUED',
          item.scheduledFor || new Date().toISOString(),
          item.retryCount || 0,
          item.lastError || null,
        ]
      );
      if ((res.rowCount || 0) > 0) {
        super.push(item);
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('[JobRepository] Error enqueueing durable job:', err.message);
      throw err;
    }
  }

  public async cancelQueuedJob(id: string, reason = 'CANCELLED'): Promise<void> {
    try {
      await query(
        `UPDATE jobs SET status = 'CANCELLED', last_error = $2 WHERE id = $1 AND status = 'QUEUED'`,
        [id, reason]
      );
      const job = this.find((j) => j.id === id);
      if (job && job.status === 'QUEUED') {
        job.status = 'FAILED';
        job.lastError = reason;
      }
    } catch (err: any) {
      console.error(`[JobRepository] Error cancelling job ${id}:`, err.message);
    }
  }

  public async failJob(id: string, error: string, maxRetries = 3): Promise<void> {
    try {
      const job = this.find((j) => j.id === id);
      const retryCount = (job?.retryCount || 0) + 1;
      const newStatus = retryCount >= maxRetries ? 'FAILED' : 'QUEUED';

      await query(
        `UPDATE jobs
         SET status = $1, retry_count = $2, last_error = $3
         WHERE id = $4`,
        [newStatus, retryCount, error, id]
      );

      if (job) {
        job.status = newStatus;
        job.retryCount = retryCount;
        job.lastError = error;
      }
    } catch (err: any) {
      console.error(`[JobRepository] Error failing job ${id}:`, err.message);
    }
  }
}
