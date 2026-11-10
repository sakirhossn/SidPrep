import { sqliteDb, LocalAnswerRecord } from './sqliteDatabase';
import { api, ApiError } from '../api/client';
import { telemetry } from './telemetry';

export type SyncState = 'SAVED_LOCALLY' | 'SYNCED' | 'OFFLINE' | 'SYNCING';

export interface AnswerEvent {
  attemptId: string;
  questionId: string;
  selectedOptionId: string | null;
  isMarkedForReview: boolean;
  timeSpentSeconds: number;
}

export class AnswerSyncEngine {
  private sequenceCounter = 0;
  private isFlushing = false;
  private pendingFlushAttemptId: string | null = null;
  private syncStateListeners = new Set<(status: SyncState) => void>();
  private currentSyncState: SyncState = 'SYNCED';

  constructor() {
    this.sequenceCounter = Date.now();
  }

  public getNextSequence(): number {
    this.sequenceCounter += 1;
    return this.sequenceCounter;
  }

  public subscribeSyncState(listener: (status: SyncState) => void): () => void {
    this.syncStateListeners.add(listener);
    listener(this.currentSyncState);
    return () => {
      this.syncStateListeners.delete(listener);
    };
  }

  private setSyncState(state: SyncState) {
    this.currentSyncState = state;
    this.syncStateListeners.forEach(fn => fn(state));
  }

  public getCurrentSyncState(): SyncState {
    return this.currentSyncState;
  }

  /**
   * Save user answer immediately to local SQLite database with monotonic sequence.
   * Then triggers asynchronous sync with server.
   */
  public async recordAnswer(event: AnswerEvent): Promise<LocalAnswerRecord> {
    const sequence = this.getNextSequence();
    const record: LocalAnswerRecord = {
      attemptId: event.attemptId,
      questionId: event.questionId,
      selectedOptionId: event.selectedOptionId,
      isMarkedForReview: event.isMarkedForReview,
      clientSequence: sequence,
      timeSpentSeconds: event.timeSpentSeconds,
      clientTimestamp: new Date().toISOString(),
      syncStatus: 'SAVED_LOCALLY'
    };

    // 1. Instant local persistence (safe offline)
    await sqliteDb.saveAnswer(record);
    this.setSyncState('SAVED_LOCALLY');

    // 2. Trigger asynchronous background sync
    this.flushPendingAnswers(event.attemptId);

    return record;
  }

  /**
   * Batch flushes all pending answers for the attempt to /v1/sync/answers
   */
  public async flushPendingAnswers(attemptId: string): Promise<boolean> {
    if (this.isFlushing) {
      this.pendingFlushAttemptId = attemptId;
      return false;
    }
    this.isFlushing = true;
    this.setSyncState('SYNCING');

    try {
      const pending = await sqliteDb.getPendingAnswers(attemptId);
      if (pending.length === 0) {
        this.setSyncState('SYNCED');
        this.isFlushing = false;
        return true;
      }

      const syncPayload = pending.map(p => ({
        attemptId: p.attemptId,
        questionId: p.questionId,
        selectedOptionId: p.selectedOptionId,
        isMarkedForReview: p.isMarkedForReview,
        clientSequence: p.clientSequence,
        clientTimestamp: p.clientTimestamp,
        timeSpentSeconds: p.timeSpentSeconds
      }));

      const res = await api.syncAnswers({
        attemptId,
        answers: syncPayload
      });

      // Mark successfully synced in SQLite using sequence-aware acks (F23)
      const acks = (res.acknowledgedSequences && res.acknowledgedSequences.length > 0)
        ? res.acknowledgedSequences
        : (res.syncedQuestionIds || []).map((qId: string) => {
            const match = syncPayload.find(p => p.questionId === qId);
            return { questionId: qId, clientSequence: match?.clientSequence ?? Number.MAX_SAFE_INTEGER };
          });

      await sqliteDb.markAnswersSynced(attemptId, acks);
      this.setSyncState('SYNCED');
      return true;
    } catch (err: any) {
      if (err instanceof ApiError && err.isOffline) {
        this.setSyncState('OFFLINE');
      } else {
        this.setSyncState('SAVED_LOCALLY');
      }
      telemetry.track('SYNC_CONFLICT', {
        attemptId,
        error: String(err.message || 'Sync failed')
      });
      return false;
    } finally {
      this.isFlushing = false;
      if (this.pendingFlushAttemptId) {
        const nextAttempt = this.pendingFlushAttemptId;
        this.pendingFlushAttemptId = null;
        setTimeout(() => {
          this.flushPendingAnswers(nextAttempt);
        }, 50);
      }
    }
  }

  /**
   * Formal test submission. Ensures offline answers are flushed or warns user.
   */
  public async submitTest(attemptId: string, totalTimeSpentSeconds: number) {
    const allAnswers = await sqliteDb.getAnswersForAttempt(attemptId);
    
    // Attempt final flush before submission
    await this.flushPendingAnswers(attemptId);

    const submitPayload = {
      attemptId,
      timeSpentSeconds: totalTimeSpentSeconds,
      answers: allAnswers.map(a => ({
        questionId: a.questionId,
        selectedOptionId: a.selectedOptionId,
        isMarkedForReview: a.isMarkedForReview,
        timeSpentSeconds: a.timeSpentSeconds,
        clientSequence: a.clientSequence
      }))
    };

    // Server-authoritative grading call
    const result = await api.submitAttempt(attemptId, submitPayload);

    // Clean up local queue for this attempt
    await sqliteDb.clearAttemptAnswers(attemptId);
    
    telemetry.track('TEST_COMPLETED', {
      attemptId,
      testId: result.testId,
      score: result.totalScore,
      accuracy: result.overallAccuracy
    });

    return result;
  }
}

export const syncEngine = new AnswerSyncEngine();
