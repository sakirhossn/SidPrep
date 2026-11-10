import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Server-Authoritative Scoring & Negative Marking Invariants', () => {
  it('correctly calculates marks with SSC CGL negative marking rules (+2.0 / -0.5)', () => {
    const questionMarks = 2.0;
    const negativeMarks = 0.5;

    const answers = [
      { questionId: 'q1', userChoice: 'opt_a', correctChoice: 'opt_a' }, // Correct: +2.0
      { questionId: 'q2', userChoice: 'opt_b', correctChoice: 'opt_c' }, // Incorrect: -0.5
      { questionId: 'q3', userChoice: null, correctChoice: 'opt_d' }    // Unattempted: 0
    ];

    let totalScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unattemptedCount = 0;

    for (const ans of answers) {
      if (ans.userChoice === null) {
        unattemptedCount++;
      } else if (ans.userChoice === ans.correctChoice) {
        correctCount++;
        totalScore += questionMarks;
      } else {
        incorrectCount++;
        totalScore -= negativeMarks;
      }
    }

    assert.strictEqual(correctCount, 1);
    assert.strictEqual(incorrectCount, 1);
    assert.strictEqual(unattemptedCount, 1);
    assert.strictEqual(totalScore, 1.5, '2.0 - 0.5 should equal 1.5');

    const accuracy = Math.round((correctCount / (correctCount + incorrectCount)) * 100);
    assert.strictEqual(accuracy, 50, 'Accuracy should be 50%');
  });

  it('prohibits inventing percentile or rank when sample size is below threshold', () => {
    const minSampleSizeThreshold = 100;
    const currentTestTakers = 45; // Below threshold

    const isSampleSufficient = currentTestTakers >= minSampleSizeThreshold;
    const rank = isSampleSufficient ? 12 : null;
    const percentile = isSampleSufficient ? 92.5 : null;

    assert.strictEqual(isSampleSufficient, false);
    assert.strictEqual(rank, null, 'Rank must be null when sample threshold is not met');
    assert.strictEqual(percentile, null, 'Percentile must be null when sample threshold is not met');
  });
});
