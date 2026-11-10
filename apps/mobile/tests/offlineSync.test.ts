import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AnswerSyncEngine } from '../src/services/answerSyncEngine';
import { sqliteDb } from '../src/services/sqliteDatabase';

describe('AnswerSyncEngine & Offline Sync Queue', () => {
  it('assigns monotonically increasing client sequences', () => {
    const engine = new AnswerSyncEngine();
    const seq1 = engine.getNextSequence();
    const seq2 = engine.getNextSequence();
    const seq3 = engine.getNextSequence();

    assert.ok(seq2 > seq1, `Expected seq2 (${seq2}) > seq1 (${seq1})`);
    assert.ok(seq3 > seq2, `Expected seq3 (${seq3}) > seq2 (${seq2})`);
  });

  it('records answers locally in SQLite database before network sync', async () => {
    const engine = new AnswerSyncEngine();
    const attemptId = 'test_attempt_001';

    await engine.recordAnswer({
      attemptId,
      questionId: 'q101',
      selectedOptionId: 'opt_a',
      isMarkedForReview: false,
      timeSpentSeconds: 15
    });

    const pending = await sqliteDb.getPendingAnswers(attemptId);
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0]?.questionId, 'q101');
    assert.strictEqual(pending[0]?.selectedOptionId, 'opt_a');
    assert.strictEqual(pending[0]?.syncStatus, 'SAVED_LOCALLY');
  });

  it('marks answers as SYNCED once server sync succeeds', async () => {
    const attemptId = 'test_attempt_002';

    await sqliteDb.saveAnswer({
      attemptId,
      questionId: 'q201',
      selectedOptionId: 'opt_b',
      isMarkedForReview: true,
      clientSequence: 100,
      timeSpentSeconds: 20,
      clientTimestamp: new Date().toISOString(),
      syncStatus: 'SAVED_LOCALLY'
    });

    let pending = await sqliteDb.getPendingAnswers(attemptId);
    assert.strictEqual(pending.length, 1);

    await sqliteDb.markAnswersSynced(attemptId, ['q201']);

    pending = await sqliteDb.getPendingAnswers(attemptId);
    assert.strictEqual(pending.length, 0, 'Synced answers should not appear in pending list');

    const all = await sqliteDb.getAnswersForAttempt(attemptId);
    assert.strictEqual(all[0]?.syncStatus, 'SYNCED');
  });
});
