import { BaseRepository } from './base.js';
import { query } from '../pool.js';
import type { AttemptRecord } from '../index.js';

export interface AnswerItem {
  selectedOptionId: string | null;
  clientSequence: number;
  isMarkedForReview: boolean;
  timestamp: string;
}

export class PersistentAnswersMap {
  private items: Record<string, AnswerItem> = Object.create(null);
  private attemptId: string;

  constructor(attemptId: string, initialItems: Record<string, AnswerItem> = {}) {
    this.attemptId = attemptId;
    for (const [k, v] of Object.entries(initialItems)) {
      this.items[k] = v;
    }
  }

  public get(questionId: string): AnswerItem | undefined {
    return this.items[questionId];
  }

  public has(questionId: string): boolean {
    return questionId in this.items;
  }

  public async set(questionId: string, answer: AnswerItem): Promise<this> {
    this.items[questionId] = answer;
    await query('UPDATE attempts SET answers = $1 WHERE id = $2', [JSON.stringify(this.items), this.attemptId]);
    return this;
  }

  public setLocal(questionId: string, answer: AnswerItem): this {
    this.items[questionId] = answer;
    return this;
  }

  public delete(questionId: string): boolean {
    const existed = questionId in this.items;
    if (existed) {
      delete this.items[questionId];
      query('UPDATE attempts SET answers = $1 WHERE id = $2', [JSON.stringify(this.items), this.attemptId]).catch(
        (err) => {
          console.error(`[PersistentAnswersMap] Error deleting answer for attempt ${this.attemptId}:`, err);
        }
      );
    }
    return existed;
  }

  public clear(): void {
    this.items = Object.create(null);
    query('UPDATE attempts SET answers = $1 WHERE id = $2', ['{}', this.attemptId]).catch((err) => {
      console.error(`[PersistentAnswersMap] Error clearing answers for attempt ${this.attemptId}:`, err);
    });
  }

  public get size(): number {
    return Object.keys(this.items).length;
  }

  public values(): IterableIterator<AnswerItem> {
    return Object.values(this.items)[Symbol.iterator]();
  }

  public keys(): IterableIterator<string> {
    return Object.keys(this.items)[Symbol.iterator]();
  }

  public entries(): IterableIterator<[string, AnswerItem]> {
    return Object.entries(this.items)[Symbol.iterator]() as IterableIterator<[string, AnswerItem]>;
  }

  public [Symbol.iterator](): IterableIterator<[string, AnswerItem]> {
    return this.entries();
  }

  public forEach(callbackfn: (value: AnswerItem, key: string, map: any) => void): void {
    for (const [k, v] of Object.entries(this.items)) {
      callbackfn(v, k, this);
    }
  }

  public toJSON(): Record<string, AnswerItem> {
    return this.items;
  }
}

export class AttemptRepository extends BaseRepository<AttemptRecord> {
  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>('SELECT * FROM attempts');
      this.cache = Object.create(null);
      for (const row of res.rows) {
        const rawAnswers = typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers || {};
        const answersMap = new PersistentAnswersMap(row.id, rawAnswers);
        const attempt: AttemptRecord = {
          id: row.id,
          testId: row.test_id,
          studentId: row.student_id,
          status: (row.status as any) || 'IN_PROGRESS',
          startedAt: row.started_at ? new Date(row.started_at).toISOString() : new Date().toISOString(),
          expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : undefined,
          submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : undefined,
          durationSeconds: Number(row.duration_seconds || row.time_spent_seconds || 0),
          score: Number(row.score || 0),
          maxScore: Number(row.max_score || 0),
          accuracy: Number(row.accuracy || 0),
          correctCount: Number(row.correct_count || 0),
          wrongCount: Number(row.wrong_count || 0),
          unattemptedCount: Number(row.unattempted_count || 0),
          answers: answersMap as any,
          resultSnapshot: typeof row.result_snapshot === 'string' ? JSON.parse(row.result_snapshot) : row.result_snapshot || undefined,
        };
        this.cache[attempt.id] = attempt;
      }
      this.isLoaded = true;
    } catch (err: any) {
      console.error('[AttemptRepository] Error loading from DB:', err.message);
    }
  }

  public override async set(id: string, record: AttemptRecord): Promise<AttemptRecord> {
    // If answers is not already PersistentAnswersMap, wrap it
    if (!(record.answers instanceof PersistentAnswersMap)) {
      let initialObj: Record<string, AnswerItem> = {};
      if (record.answers && typeof (record.answers as any).entries === 'function') {
        for (const [k, v] of (record.answers as any).entries()) {
          initialObj[k] = v;
        }
      }
      record.answers = new PersistentAnswersMap(id, initialObj) as any;
    }
    return await super.set(id, record);
  }

  public async persistInsertOrUpdate(record: AttemptRecord): Promise<void> {
    const answersJson =
      record.answers instanceof PersistentAnswersMap
        ? JSON.stringify(record.answers.toJSON())
        : JSON.stringify(record.answers || {});

    await query(
      `INSERT INTO attempts (
        id, test_id, student_id, status, started_at, expires_at, submitted_at,
        time_spent_seconds, duration_seconds, score, max_score, accuracy,
        correct_count, wrong_count, unattempted_count, answers, result_snapshot
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (id) DO UPDATE SET
        test_id = EXCLUDED.test_id,
        student_id = EXCLUDED.student_id,
        status = EXCLUDED.status,
        expires_at = EXCLUDED.expires_at,
        submitted_at = EXCLUDED.submitted_at,
        time_spent_seconds = EXCLUDED.time_spent_seconds,
        duration_seconds = EXCLUDED.duration_seconds,
        score = EXCLUDED.score,
        max_score = EXCLUDED.max_score,
        accuracy = EXCLUDED.accuracy,
        correct_count = EXCLUDED.correct_count,
        wrong_count = EXCLUDED.wrong_count,
        unattempted_count = EXCLUDED.unattempted_count,
        answers = EXCLUDED.answers,
        result_snapshot = EXCLUDED.result_snapshot`,
      [
        record.id,
        record.testId,
        record.studentId,
        record.status,
        record.startedAt,
        record.expiresAt || null,
        record.submittedAt || null,
        record.durationSeconds,
        record.durationSeconds,
        record.score,
        record.maxScore,
        record.accuracy,
        record.correctCount,
        record.wrongCount,
        record.unattemptedCount,
        answersJson,
        record.resultSnapshot ? JSON.stringify(record.resultSnapshot) : null,
      ]
    );
  }

  public async persistDelete(id: string): Promise<void> {
    await query('DELETE FROM attempts WHERE id = $1', [id]);
  }

  public async persistClear(): Promise<void> {
    await query('DELETE FROM attempts');
  }
}
