import { BaseRepository } from './base.js';
import { query } from '../pool.js';
import type { ExamRecord } from '../index.js';

export class ExamRepository extends BaseRepository<ExamRecord> {
  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>('SELECT * FROM exams');
      this.cache = Object.create(null);
      for (const row of res.rows) {
        const stages = typeof row.stages === 'string' ? JSON.parse(row.stages) : row.stages || [];
        const syllabusTree = typeof row.syllabus_tree === 'string' ? JSON.parse(row.syllabus_tree) : row.syllabus_tree || [];
        const exam: ExamRecord = {
          id: row.id,
          bodyCode: (row.body_code as any) || 'SSC',
          code: row.code,
          name: row.name,
          description: row.description || '',
          stagesCount: Number(row.stages_count) || (stages.length || 1),
          verifiedDate: row.verified_date || '2026-01-01',
          sourceUrl: row.source_url || '',
          stages,
          syllabusTree,
        };
        this.cache[exam.id] = exam;
      }
      this.isLoaded = true;
    } catch (err: any) {
      console.error('[ExamRepository] Error loading from DB:', err.message);
    }
  }

  public async persistInsertOrUpdate(record: ExamRecord): Promise<void> {
    await query(
      `INSERT INTO exams (
        id, body_code, code, name, description, stages_count, verified_date, source_url, stages, syllabus_tree
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        body_code = EXCLUDED.body_code,
        code = EXCLUDED.code,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        stages_count = EXCLUDED.stages_count,
        verified_date = EXCLUDED.verified_date,
        source_url = EXCLUDED.source_url,
        stages = EXCLUDED.stages,
        syllabus_tree = EXCLUDED.syllabus_tree`,
      [
        record.id,
        record.bodyCode,
        record.code,
        record.name,
        record.description,
        record.stagesCount,
        record.verifiedDate,
        record.sourceUrl,
        JSON.stringify(record.stages),
        JSON.stringify(record.syllabusTree),
      ]
    );
  }

  public async persistDelete(id: string): Promise<void> {
    await query('DELETE FROM exams WHERE id = $1', [id]);
  }

  public async persistClear(): Promise<void> {
    await query('DELETE FROM exams');
  }
}
