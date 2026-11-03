import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createMockApp } from '../../../tools/mock-backend/src/index';
import { SidPrepApiClient, ApiError } from '../src/api/client';

describe('SidPrep 2.0 Mobile API Integration with Shared Backend Contract', () => {
  let app: any;
  let client: SidPrepApiClient;

  before(async () => {
    process.env['NODE_ENV'] = 'test';
    app = createMockApp();
    await app.ready();

    // In-memory Fastify injection adapter (100% full API routing without sandboxed TCP socket locks)
    const mockFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const urlStr = url.toString();
      const pathAndQuery = urlStr.replace(/^https?:\/\/[^/]+/, '');
      const injectRes = await app.inject({
        method: (init?.method as any) || 'GET',
        url: pathAndQuery,
        headers: init?.headers as any,
        payload: init?.body ? (typeof init.body === 'string' ? init.body : JSON.stringify(init.body)) : undefined
      });

      return new Response(injectRes.payload, {
        status: injectRes.statusCode,
        headers: injectRes.headers as any
      });
    };

    client = new SidPrepApiClient('https://api.sidprep.in/v1', mockFetch as any);
  });

  after(async () => {
    if (app) await app.close();
  });

  it('verifies student email OTP and receives JWT tokens', async () => {
    const otpRes = await client.requestOtp({ email: 'student@sidprep.in' });
    assert.strictEqual(otpRes.success, true);

    const verifyRes = await client.verifyOtp({
      email: 'student@sidprep.in',
      otp: '123456'
    });
    assert.ok(verifyRes.tokens.accessToken);
    assert.strictEqual(verifyRes.user.email, 'student@sidprep.in');
  });

  it('fetches verified exams with official status and dates', async () => {
    const exams = await client.getExams();
    assert.ok(exams.length >= 3);

    const ssc = exams.find(e => e.id === 'ssc-cgl');
    assert.ok(ssc);
    assert.strictEqual(ssc?.isDateAnnounced, true);
    assert.ok(ssc?.officialExamDate);

    const rrb = exams.find(e => e.id === 'rrb-ntpc');
    assert.ok(rrb);
    assert.strictEqual(rrb?.isDateAnnounced, false, 'RRB NTPC should show Date Not Announced');
    assert.strictEqual(rrb?.officialExamDate, null);
  });

  it('runs mock test attempt with monotonic answer sync and authoritative grading', async () => {
    const startRes = await client.startAttempt('cgl-mock-01');
    assert.ok(startRes.attemptId);
    assert.ok(startRes.questions.length >= 2);
    assert.ok(startRes.durationSeconds > 0);

    // Monotonic answer sync
    const syncRes = await client.syncAnswers({
      attemptId: startRes.attemptId,
      answers: [
        {
          attemptId: startRes.attemptId,
          questionId: 'q1',
          selectedOptionId: 'opt_1b',
          isMarkedForReview: false,
          clientSequence: 1,
          clientTimestamp: new Date().toISOString(),
          timeSpentSeconds: 30
        },
        {
          attemptId: startRes.attemptId,
          questionId: 'q2',
          selectedOptionId: 'opt_2a',
          isMarkedForReview: true,
          clientSequence: 2,
          clientTimestamp: new Date().toISOString(),
          timeSpentSeconds: 45
        }
      ]
    });
    assert.strictEqual(syncRes.syncedQuestionIds.length, 2);

    // Authoritative submission
    const result = await client.submitAttempt(startRes.attemptId, {
      attemptId: startRes.attemptId,
      timeSpentSeconds: 75,
      answers: [
        {
          questionId: 'q1',
          selectedOptionId: 'opt_1b',
          isMarkedForReview: false,
          timeSpentSeconds: 30,
          clientSequence: 1
        },
        {
          questionId: 'q2',
          selectedOptionId: 'opt_2a',
          isMarkedForReview: true,
          timeSpentSeconds: 45,
          clientSequence: 2
        }
      ]
    });

    assert.strictEqual(result.totalScore, 4.0, 'Both questions correct should score 4.0 marks');
    assert.strictEqual(result.correctCount, 2);
    assert.strictEqual(result.incorrectCount, 0);
    assert.strictEqual(result.overallAccuracy, 100);
    assert.ok(result.solutions.length >= 2, 'Solutions must be returned after submission');
  });

  it('enforces download permission gating (downloadAllowed: false returns 403 Forbidden)', async () => {
    // 1. Download permitted item
    const allowedTicket = await client.getDownloadTicket('res-quant-formula');
    assert.ok(allowedTicket.downloadUrl);
    assert.ok(allowedTicket.expiresAt);

    // 2. Download restricted preview-only item
    await assert.rejects(
      async () => {
        await client.getDownloadTicket('res-rrb-ga-compendium');
      },
      (err: any) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.statusCode, 403);
        assert.ok(err.message.includes('Download permission denied'));
        return true;
      }
    );
  });
});
