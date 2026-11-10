import { query } from '../pool.js';
import { hashOtp, verifyOtpHash } from '../../lib/security.js';

export interface OtpChallenge {
  otpHash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt?: number;
  devOtp?: string; // Only populated in non-production for testing
  registrationDraft?: any;
}

export class OtpChallengeRepository {
  private cache: Record<string, OtpChallenge> = Object.create(null);
  private pendingWrites: Set<Promise<any>> = new Set();

  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>(
        'SELECT * FROM email_otp_challenges WHERE consumed_at IS NULL AND expires_at > NOW()'
      );
      this.cache = Object.create(null);
      for (const row of res.rows) {
        this.cache[row.email.toLowerCase()] = {
          otpHash: row.otp_hash || (row.otp ? hashOtp(row.otp) : ''),
          expiresAt: new Date(row.expires_at).getTime(),
          attempts: Number(row.attempts) || 0,
          lastSentAt: row.last_sent_at ? new Date(row.last_sent_at).getTime() : undefined,
        };
      }
    } catch (err: any) {
      console.error('[OtpChallengeRepository] Error loading OTP challenges:', err.message);
    }
  }

  public get(email: string): OtpChallenge | undefined {
    return this.cache[email.toLowerCase()];
  }

  public set(email: string, challenge: OtpChallenge): this {
    const key = email.toLowerCase();
    this.cache[key] = challenge;

    // Invariant F22: Retire active challenges for this email and insert fresh record with otp_hash
    const p = (async () => {
      try {
        await query(
          'UPDATE email_otp_challenges SET consumed_at = NOW() WHERE LOWER(email) = $1 AND consumed_at IS NULL',
          [key]
        );
        await query(
          `INSERT INTO email_otp_challenges (
            id, email, otp_hash, attempts, expires_at, created_at, last_sent_at
          ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [
            `otp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            key,
            challenge.otpHash,
            challenge.attempts,
            new Date(challenge.expiresAt).toISOString(),
          ]
        );
      } catch (err) {
        console.error(`[OtpChallengeRepository] Error persisting OTP challenge for ${email}:`, err);
      }
    })().finally(() => {
      this.pendingWrites.delete(p);
    });

    this.pendingWrites.add(p);
    return this;
  }

  public async incrementAttempts(email: string): Promise<number> {
    const key = email.toLowerCase();
    const challenge = this.cache[key];
    if (challenge) {
      challenge.attempts++;
    }
    query(
      'UPDATE email_otp_challenges SET attempts = attempts + 1 WHERE LOWER(email) = $1 AND consumed_at IS NULL',
      [key]
    ).catch((err) => {
      console.error(`[OtpChallengeRepository] Error incrementing attempts for ${email}:`, err);
    });
    return challenge ? challenge.attempts : 1;
  }

  public async flush(): Promise<void> {
    if (this.pendingWrites.size > 0) {
      await Promise.allSettled(Array.from(this.pendingWrites));
    }
  }

  public delete(email: string): boolean {
    const key = email.toLowerCase();
    const existed = key in this.cache;
    if (existed) {
      delete this.cache[key];
      query('UPDATE email_otp_challenges SET consumed_at = NOW() WHERE LOWER(email) = $1', [key]).catch((err) => {
        console.error(`[OtpChallengeRepository] Error consuming OTP challenge for ${email}:`, err);
      });
    }
    return existed;
  }

  public clear(): void {
    this.cache = Object.create(null);
    query('UPDATE email_otp_challenges SET consumed_at = NOW()').catch((err) => {
      console.error('[OtpChallengeRepository] Error clearing OTP challenges:', err);
    });
  }

  public get size(): number {
    return Object.keys(this.cache).length;
  }
}
