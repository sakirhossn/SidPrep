import { BaseRepository } from './base.js';
import { query } from '../pool.js';
import type { TestRecord } from '../index.js';

export class TestRepository extends BaseRepository<TestRecord> {
  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>('SELECT * FROM tests');
      this.cache = Object.create(null);
      for (const row of res.rows) {
        const instructions = typeof row.instructions === 'string' ? JSON.parse(row.instructions) : row.instructions || [];
        const sections = typeof row.sections === 'string' ? JSON.parse(row.sections) : row.sections || [];
        const test: TestRecord = {
          id: row.id,
          examCode: row.exam_code || 'SSC_CGL',
          title: row.title,
          type: (row.type as any) || 'FULL',
          durationMinutes: Number(row.duration_minutes) || 60,
          totalQuestions: Number(row.total_questions) || 0,
          totalMarks: Number(row.total_marks) || 0,
          isFree: Boolean(row.is_free),
          isPublished: Boolean(row.is_published),
          instructions,
          sections,
        };
        this.cache[test.id] = test;
      }
      this.isLoaded = true;
    } catch (err: any) {
      console.error('[TestRepository] Error loading from DB:', err.message);
    }
  }

  public async persistInsertOrUpdate(record: TestRecord): Promise<void> {
    await query(
      `INSERT INTO tests (
        id, exam_code, title, type, duration_minutes, total_questions, total_marks, is_free, is_published, instructions, sections
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET
        exam_code = EXCLUDED.exam_code,
        title = EXCLUDED.title,
        type = EXCLUDED.type,
        duration_minutes = EXCLUDED.duration_minutes,
        total_questions = EXCLUDED.total_questions,
        total_marks = EXCLUDED.total_marks,
        is_free = EXCLUDED.is_free,
        is_published = EXCLUDED.is_published,
        instructions = EXCLUDED.instructions,
        sections = EXCLUDED.sections`,
      [
        record.id,
        record.examCode,
        record.title,
        record.type,
        record.durationMinutes,
        record.totalQuestions,
        record.totalMarks,
        record.isFree,
        record.isPublished,
        JSON.stringify(record.instructions),
        JSON.stringify(record.sections),
      ]
    );
  }

  public async persistDelete(id: string): Promise<void> {
    await query('DELETE FROM tests WHERE id = $1', [id]);
  }

  public async persistClear(): Promise<void> {
    await query('DELETE FROM tests');
  }
}
