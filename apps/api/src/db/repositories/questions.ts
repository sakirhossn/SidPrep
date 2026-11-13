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
          externalSourceId: row.external_source_id || undefined,
          contentFingerprint: row.content_fingerprint || undefined,
          marks: row.marks != null ? Number(row.marks) : undefined,
          negativeMarks: row.negative_marks != null ? Number(row.negative_marks) : undefined,
          marksSource: row.marks_source || undefined,
          importBatchId: row.import_batch_id || undefined,
          needsReview: Boolean(row.needs_review),
          reviewFlags: Array.isArray(row.review_flags) ? row.review_flags : [],
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
        id, topic_id, difficulty, pyq_year, pyq_exam, pyq_shift, correct_option_id, created_by, status,
        external_source_id, content_fingerprint, marks, negative_marks, marks_source, import_batch_id,
        needs_review, review_flags, translations
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (id) DO UPDATE SET
        topic_id = EXCLUDED.topic_id,
        difficulty = EXCLUDED.difficulty,
        pyq_year = EXCLUDED.pyq_year,
        pyq_exam = EXCLUDED.pyq_exam,
        pyq_shift = EXCLUDED.pyq_shift,
        correct_option_id = EXCLUDED.correct_option_id,
        created_by = EXCLUDED.created_by,
        status = EXCLUDED.status,
        external_source_id = EXCLUDED.external_source_id,
        content_fingerprint = EXCLUDED.content_fingerprint,
        marks = EXCLUDED.marks,
        negative_marks = EXCLUDED.negative_marks,
        marks_source = EXCLUDED.marks_source,
        import_batch_id = EXCLUDED.import_batch_id,
        needs_review = EXCLUDED.needs_review,
        review_flags = EXCLUDED.review_flags,
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
        record.externalSourceId || null,
        record.contentFingerprint || null,
        record.marks != null ? record.marks : null,
        record.negativeMarks != null ? record.negativeMarks : null,
        record.marksSource || null,
        record.importBatchId || null,
        Boolean(record.needsReview),
        JSON.stringify(record.reviewFlags || []),
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
