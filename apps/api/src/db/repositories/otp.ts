import { query } from '../pool.js';
import { hashOtp, verifyOtpHash } from '../../lib/security.js';

export interface OtpChallenge {
  id?: string;
  email: string;
  purpose: string;
  otpHash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt?: number;
  devOtp?: string; // Only populated in non-production for testing
  registrationDraft?: any;
  cooldownUntil?: number;
}

export class OtpChallengeRepository {
  private cache: Record<string, OtpChallenge> = Object.create(null);
  private pendingWrites: Set<Promise<any>> = new Set();

  private makeKey(email: string, purpose?: string): string {
    const normEmail = email.toLowerCase().trim();
    if (normEmail.startsWith('admin_2fa_')) {
      return normEmail;
    }
    const p = purpose || 'student_registration';
    return `${normEmail}::${p}`;
  }

  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>(
        'SELECT * FROM email_otp_challenges WHERE consumed_at IS NULL AND expires_at > NOW()'
      );
      this.cache = Object.create(null);
      for (const row of res.rows) {
        const purpose = row.purpose || 'student_registration';
        const key = this.makeKey(row.email, purpose);
        this.cache[key] = {
          id: row.id,
          email: row.email.toLowerCase(),
          purpose,
          otpHash: row.otp_hash || (row.otp ? hashOtp(row.otp) : ''),
          expiresAt: new Date(row.expires_at).getTime(),
          attempts: Number(row.attempts) || 0,
          lastSentAt: row.last_sent_at ? new Date(row.last_sent_at).getTime() : undefined,
          cooldownUntil: row.cooldown_until ? new Date(row.cooldown_until).getTime() : undefined,
        };
      }
    } catch (err: any) {
      console.error('[OtpChallengeRepository] Error loading OTP challenges:', err.message);
    }
  }

  public get(email: string, purpose?: string): OtpChallenge | undefined {
    const key = this.makeKey(email, purpose);
    // Try exact purpose key, fallback to bare email if legacy
    return this.cache[key] || this.cache[email.toLowerCase()];
  }

  public async getActiveChallenge(email: string, purpose = 'student_registration'): Promise<OtpChallenge | null> {
    const cached = this.get(email, purpose);
    if (cached) {
      if (Date.now() <= cached.expiresAt && cached.attempts < 5) {
        return cached;
      }
    }

    try {
      const res = await query<any>(
        `SELECT * FROM email_otp_challenges 
         WHERE LOWER(email) = LOWER($1) AND purpose = $2 AND consumed_at IS NULL AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [email.trim().toLowerCase(), purpose]
      );

      if (res.rows && res.rows.length > 0) {
        const row = res.rows[0];
        const challenge: OtpChallenge = {
          id: row.id,
          email: row.email.toLowerCase(),
          purpose: row.purpose || purpose,
          otpHash: row.otp_hash,
          expiresAt: new Date(row.expires_at).getTime(),
          attempts: Number(row.attempts) || 0,
          lastSentAt: row.last_sent_at ? new Date(row.last_sent_at).getTime() : undefined,
          cooldownUntil: row.cooldown_until ? new Date(row.cooldown_until).getTime() : undefined,
        };
        const key = this.makeKey(email, purpose);
        this.cache[key] = challenge;
        return challenge;
      }
    } catch (err: any) {
      console.error(`[OtpChallengeRepository] DB query error for ${email}:`, err.message);
    }

    return null;
  }

  public set(email: string, challenge: OtpChallenge, purpose = 'student_registration'): this {
    const normEmail = email.toLowerCase().trim();
    const resolvedPurpose = challenge.purpose || purpose;
    const key = this.makeKey(normEmail, resolvedPurpose);
    const challengeId = challenge.id || `otp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    challenge.id = challengeId;
    challenge.email = normEmail;
    challenge.purpose = resolvedPurpose;

    this.cache[key] = challenge;
    // Also set legacy bare email key if it is student_registration or admin_2fa
    this.cache[normEmail] = challenge;

    const p = (async () => {
      try {
        await query(
          'UPDATE email_otp_challenges SET consumed_at = NOW() WHERE LOWER(email) = $1 AND purpose = $2 AND consumed_at IS NULL',
          [normEmail, resolvedPurpose]
        );
        await query(
          `INSERT INTO email_otp_challenges (
            id, email, purpose, otp_hash, attempts, expires_at, created_at, last_sent_at, cooldown_until
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7)`,
          [
            challengeId,
            normEmail,
            resolvedPurpose,
            challenge.otpHash,
            challenge.attempts,
            new Date(challenge.expiresAt).toISOString(),
            challenge.cooldownUntil ? new Date(challenge.cooldownUntil).toISOString() : null,
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

  public async incrementAttempts(email: string, purpose?: string): Promise<number> {
    const key = this.makeKey(email, purpose);
    const challenge = this.cache[key] || this.cache[email.toLowerCase()];
    if (challenge) {
      challenge.attempts++;
    }
    const resolvedPurpose = challenge?.purpose || purpose || 'student_registration';
    query(
      `UPDATE email_otp_challenges SET attempts = attempts + 1 
       WHERE LOWER(email) = $1 AND purpose = $2 AND consumed_at IS NULL`,
      [email.toLowerCase().trim(), resolvedPurpose]
    ).catch((err) => {
      console.error(`[OtpChallengeRepository] Error incrementing attempts for ${email}:`, err);
    });
    return challenge ? challenge.attempts : 1;
  }

  public async invalidateChallenge(email: string, purpose?: string, cooldownMinutes = 15): Promise<void> {
    const key = this.makeKey(email, purpose);
    delete this.cache[key];
    delete this.cache[email.toLowerCase()];
    const resolvedPurpose = purpose || 'student_registration';
    const cooldownIso = new Date(Date.now() + cooldownMinutes * 60 * 1000).toISOString();

    try {
      await query(
        `UPDATE email_otp_challenges 
         SET consumed_at = NOW(), cooldown_until = $3 
         WHERE LOWER(email) = $1 AND purpose = $2 AND consumed_at IS NULL`,
        [email.toLowerCase().trim(), resolvedPurpose, cooldownIso]
      );
    } catch (err: any) {
      console.error('[OtpChallengeRepository] Invalidate error:', err.message);
    }
  }

  public async consumeAtomically(id: string): Promise<boolean> {
    try {
      const res = await query(
        'UPDATE email_otp_challenges SET consumed_at = NOW() WHERE id = $1 AND consumed_at IS NULL RETURNING id',
        [id]
      );
      return (res.rowCount || 0) > 0;
    } catch (err: any) {
      console.error(`[OtpChallengeRepository] Atomic consume error for ${id}:`, err.message);
      return false;
    }
  }

  public async flush(): Promise<void> {
    if (this.pendingWrites.size > 0) {
      await Promise.allSettled(Array.from(this.pendingWrites));
    }
  }

  public delete(email: string, purpose?: string): boolean {
    const key = this.makeKey(email, purpose);
    const norm = email.toLowerCase().trim();
    const existed = (key in this.cache) || (norm in this.cache);
    const challenge = this.cache[key] || this.cache[norm];
    const resolvedPurpose = challenge?.purpose || purpose || 'student_registration';

    delete this.cache[key];
    delete this.cache[norm];

    query(
      'UPDATE email_otp_challenges SET consumed_at = NOW() WHERE LOWER(email) = $1 AND purpose = $2 AND consumed_at IS NULL',
      [norm, resolvedPurpose]
    ).catch((err) => {
      console.error(`[OtpChallengeRepository] Error consuming OTP challenge for ${email}:`, err);
    });
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
