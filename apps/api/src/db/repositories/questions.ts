import { BaseRepository } from './base.js';
import { query } from '../pool.js';
import type { QuestionRecord } from '../index.js';

export class QuestionRepository extends BaseRepository<QuestionRecord> {
  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>('SELECT * FROM questions');
      this.cache = Object.create(null);
      for (const row of res.rows) {
        const translations = typeof row.translations === 'string' ? JSON.parse(row.translations) : row.translations || [];
        const question: QuestionRecord = {
          id: row.id,
          topicId: row.topic_id,
          difficulty: (row.difficulty as any) || 'MEDIUM',
          pyqYear: row.pyq_year || undefined,
          pyqExam: row.pyq_exam || undefined,
          pyqShift: row.pyq_shift || undefined,
          correctOptionId: row.correct_option_id,
          createdBy: row.created_by,
          status: (row.status as any) || 'PUBLISHED',
          translations,
        };
        this.cache[question.id] = question;
      }
      this.isLoaded = true;
    } catch (err: any) {
      console.error('[QuestionRepository] Error loading from DB:', err.message);
    }
  }

  public async persistInsertOrUpdate(record: QuestionRecord): Promise<void> {
    await query(
      `INSERT INTO questions (
        id, topic_id, difficulty, pyq_year, pyq_exam, pyq_shift, correct_option_id, created_by, status, translations
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        topic_id = EXCLUDED.topic_id,
        difficulty = EXCLUDED.difficulty,
        pyq_year = EXCLUDED.pyq_year,
        pyq_exam = EXCLUDED.pyq_exam,
        pyq_shift = EXCLUDED.pyq_shift,
        correct_option_id = EXCLUDED.correct_option_id,
        created_by = EXCLUDED.created_by,
        status = EXCLUDED.status,
        translations = EXCLUDED.translations`,
      [
        record.id,
        record.topicId,
        record.difficulty,
        record.pyqYear || null,
        record.pyqExam || null,
        record.pyqShift || null,
        record.correctOptionId,
        record.createdBy,
        record.status,
        JSON.stringify(record.translations),
      ]
    );
  }

  public async persistDelete(id: string): Promise<void> {
    await query('DELETE FROM questions WHERE id = $1', [id]);
  }

  public async persistClear(): Promise<void> {
    await query('DELETE FROM questions');
  }
}
