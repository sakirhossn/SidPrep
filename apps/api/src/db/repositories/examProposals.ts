import { BaseRepository } from './base.js';
import { query } from '../pool.js';
import type { ExamProposalRecord } from '../index.js';

export class ExamProposalRepository extends BaseRepository<ExamProposalRecord> {
  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>('SELECT * FROM exam_proposals');
      this.cache = Object.create(null);
      for (const row of res.rows) {
        const proposal: ExamProposalRecord = {
          id: row.id,
          proposalId: row.id,
          examId: row.exam_id,
          proposedByAdminId: row.proposed_by_admin_id,
          proposedByEmail: row.proposed_by_email,
          diff: typeof row.diff === 'string' ? JSON.parse(row.diff) : row.diff || {},
          status: row.status as any,
          verifiedByAdminId: row.verified_by_admin_id || undefined,
          verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : undefined,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        };
        this.cache[proposal.id] = proposal;
      }
      this.isLoaded = true;
    } catch (err: any) {
      console.error('[ExamProposalRepository] Error loading from DB:', err.message);
    }
  }

  public async persistInsertOrUpdate(record: ExamProposalRecord): Promise<void> {
    const id = record.proposalId || record.id;
    record.id = id;
    record.proposalId = id;

    await query(
      `INSERT INTO exam_proposals (
        id, exam_id, proposed_by_admin_id, proposed_by_email, diff, status,
        verified_by_admin_id, verified_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        exam_id = EXCLUDED.exam_id,
        proposed_by_admin_id = EXCLUDED.proposed_by_admin_id,
        proposed_by_email = EXCLUDED.proposed_by_email,
        diff = EXCLUDED.diff,
        status = EXCLUDED.status,
        verified_by_admin_id = EXCLUDED.verified_by_admin_id,
        verified_at = EXCLUDED.verified_at`,
      [
        id,
        record.examId,
        record.proposedByAdminId,
        record.proposedByEmail,
        JSON.stringify(record.diff || {}),
        record.status,
        record.verifiedByAdminId || null,
        record.verifiedAt || null,
        record.createdAt || new Date().toISOString(),
      ]
    );
  }

  public async persistDelete(id: string): Promise<void> {
    await query('DELETE FROM exam_proposals WHERE id = $1', [id]);
  }

  public async persistClear(): Promise<void> {
    await query('DELETE FROM exam_proposals');
  }
}
