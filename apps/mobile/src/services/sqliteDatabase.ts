import { getPlatformOS } from './platform';

export interface LocalAnswerRecord {
  attemptId: string;
  questionId: string;
  selectedOptionId: string | null;
  isMarkedForReview: boolean;
  clientSequence: number;
  timeSpentSeconds: number;
  clientTimestamp: string;
  syncStatus: 'SAVED_LOCALLY' | 'SYNCED';
}

export interface CachedItemRecord {
  cacheKey: string;
  payload: string;
  updatedAt: string;
}

// In-memory fallback for web and testing environments
class InMemorySqliteFallback {
  private answers = new Map<string, LocalAnswerRecord>();
  private cache = new Map<string, CachedItemRecord>();

  async init(): Promise<void> {}

  async saveAnswer(answer: LocalAnswerRecord): Promise<void> {
    const key = `${answer.attemptId}:${answer.questionId}`;
    this.answers.set(key, answer);
  }

  async getAnswersForAttempt(attemptId: string): Promise<LocalAnswerRecord[]> {
    return Array.from(this.answers.values()).filter(a => a.attemptId === attemptId);
  }

  async getPendingAnswers(attemptId: string): Promise<LocalAnswerRecord[]> {
    return Array.from(this.answers.values()).filter(
      a => a.attemptId === attemptId && a.syncStatus === 'SAVED_LOCALLY'
    );
  }

  async markAnswersSynced(
    attemptId: string,
    acks: Array<{ questionId: string; clientSequence?: number }> | string[]
  ): Promise<void> {
    const ackMap = new Map<string, number>();
    for (const ack of acks) {
      if (typeof ack === 'string') {
        ackMap.set(ack, Number.MAX_SAFE_INTEGER);
      } else {
        ackMap.set(ack.questionId, ack.clientSequence ?? Number.MAX_SAFE_INTEGER);
      }
    }

    for (const [key, ans] of this.answers.entries()) {
      if (ans.attemptId === attemptId && ackMap.has(ans.questionId)) {
        const maxSeq = ackMap.get(ans.questionId)!;
        if (ans.clientSequence <= maxSeq) {
          this.answers.set(key, { ...ans, syncStatus: 'SYNCED' });
        }
      }
    }
  }

  async clearAttemptAnswers(attemptId: string): Promise<void> {
    for (const [key, ans] of this.answers.entries()) {
      if (ans.attemptId === attemptId) {
        this.answers.delete(key);
      }
    }
  }

  async setCache(key: string, data: any): Promise<void> {
    this.cache.set(key, {
      cacheKey: key,
      payload: JSON.stringify(data),
      updatedAt: new Date().toISOString()
    });
  }

  async getCache<T>(key: string): Promise<T | null> {
    const found = this.cache.get(key);
    if (!found) return null;
    try {
      return JSON.parse(found.payload) as T;
    } catch {
      return null;
    }
  }
}

// Native SQLite implementation using Expo SQLite
class NativeSqliteDatabase {
  private db: any = null;
  private isInitialized = false;

  async init(): Promise<void> {
    if (this.isInitialized) return;
    try {
      const SQLite = require('expo-sqlite');
      this.db = SQLite.openDatabaseSync ? SQLite.openDatabaseSync('sidprep_v2.db') : null;
      if (this.db) {
        this.db.execSync(`
          CREATE TABLE IF NOT EXISTS answers_queue (
            attempt_id TEXT NOT NULL,
            question_id TEXT NOT NULL,
            selected_option_id TEXT,
            is_marked_for_review INTEGER NOT NULL,
            client_sequence INTEGER NOT NULL,
            time_spent_seconds INTEGER NOT NULL,
            client_timestamp TEXT NOT NULL,
            sync_status TEXT NOT NULL,
            PRIMARY KEY (attempt_id, question_id)
          );

          CREATE TABLE IF NOT EXISTS cached_content (
            cache_key TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `);
      }
      this.isInitialized = true;
    } catch (e) {
      console.warn('SQLite init warning (using in-memory store):', e);
    }
  }

  async saveAnswer(answer: LocalAnswerRecord): Promise<void> {
    if (!this.db) return;
    const stmt = this.db.prepareSync(`
      INSERT OR REPLACE INTO answers_queue (
        attempt_id, question_id, selected_option_id, is_marked_for_review,
        client_sequence, time_spent_seconds, client_timestamp, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `);
    stmt.executeSync([
      answer.attemptId,
      answer.questionId,
      answer.selectedOptionId,
      answer.isMarkedForReview ? 1 : 0,
      answer.clientSequence,
      answer.timeSpentSeconds,
      answer.clientTimestamp,
      answer.syncStatus
    ]);
  }

  async getAnswersForAttempt(attemptId: string): Promise<LocalAnswerRecord[]> {
    if (!this.db) return [];
    const rows = this.db.getAllSync(
      'SELECT * FROM answers_queue WHERE attempt_id = ? ORDER BY client_sequence ASC;',
      [attemptId]
    );
    return rows.map((r: any) => ({
      attemptId: r.attempt_id,
      questionId: r.question_id,
      selectedOptionId: r.selected_option_id,
      isMarkedForReview: r.is_marked_for_review === 1,
      clientSequence: r.client_sequence,
      timeSpentSeconds: r.time_spent_seconds,
      clientTimestamp: r.client_timestamp,
      syncStatus: r.sync_status
    }));
  }

  async getPendingAnswers(attemptId: string): Promise<LocalAnswerRecord[]> {
    if (!this.db) return [];
    const rows = this.db.getAllSync(
      "SELECT * FROM answers_queue WHERE attempt_id = ? AND sync_status = 'SAVED_LOCALLY' ORDER BY client_sequence ASC;",
      [attemptId]
    );
    return rows.map((r: any) => ({
      attemptId: r.attempt_id,
      questionId: r.question_id,
      selectedOptionId: r.selected_option_id,
      isMarkedForReview: r.is_marked_for_review === 1,
      clientSequence: r.client_sequence,
      timeSpentSeconds: r.time_spent_seconds,
      clientTimestamp: r.client_timestamp,
      syncStatus: r.sync_status
    }));
  }

  async markAnswersSynced(
    attemptId: string,
    acks: Array<{ questionId: string; clientSequence?: number }> | string[]
  ): Promise<void> {
    if (!this.db || acks.length === 0) return;
    for (const ack of acks) {
      const questionId = typeof ack === 'string' ? ack : ack.questionId;
      const clientSequence = typeof ack === 'string' ? null : (ack.clientSequence ?? null);
      if (clientSequence !== null) {
        this.db.runSync(
          `UPDATE answers_queue SET sync_status = 'SYNCED' WHERE attempt_id = ? AND question_id = ? AND client_sequence <= ?;`,
          [attemptId, questionId, clientSequence]
        );
      } else {
        this.db.runSync(
          `UPDATE answers_queue SET sync_status = 'SYNCED' WHERE attempt_id = ? AND question_id = ?;`,
          [attemptId, questionId]
        );
      }
    }
  }

  async clearAttemptAnswers(attemptId: string): Promise<void> {
    if (!this.db) return;
    this.db.runSync('DELETE FROM answers_queue WHERE attempt_id = ?;', [attemptId]);
  }

  async setCache(key: string, data: any): Promise<void> {
    if (!this.db) return;
    this.db.runSync(
      'INSERT OR REPLACE INTO cached_content (cache_key, payload, updated_at) VALUES (?, ?, ?);',
      [key, JSON.stringify(data), new Date().toISOString()]
    );
  }

  async getCache<T>(key: string): Promise<T | null> {
    if (!this.db) return null;
    const row = this.db.getFirstSync('SELECT payload FROM cached_content WHERE cache_key = ?;', [key]);
    if (!row) return null;
    try {
      return JSON.parse(row.payload) as T;
    } catch {
      return null;
    }
  }
}

const currentOs = getPlatformOS();
export const sqliteDb = (currentOs === 'web' || currentOs === 'node')
  ? new InMemorySqliteFallback()
  : new NativeSqliteDatabase();
