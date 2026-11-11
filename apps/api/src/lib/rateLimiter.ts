import { query } from '../db/pool.js';

export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
  message?: string;
}

export interface RateLimitOptions {
  maxAttempts: number;
  windowMs: number;
  cooldownMs?: number;
}

/**
 * Shared Durable Rate Limiter backed by PostgreSQL
 * Counters survive process restarts and multi-instance deployments.
 */
export class DurableRateLimiter {
  /**
   * Check whether an action is currently allowed for a given key without incrementing.
   */
  public static async check(
    key: string,
    maxAttempts: number,
    windowMs: number
  ): Promise<RateLimitCheckResult> {
    try {
      const res = await query<any>(
        'SELECT count, window_start, cooldown_until FROM auth_rate_limits WHERE key = $1',
        [key]
      );

      if (!res.rows || res.rows.length === 0) {
        return { allowed: true, remaining: maxAttempts };
      }

      const row = res.rows[0];
      const now = Date.now();

      // Check active cooldown
      if (row.cooldown_until) {
        const cooldownTime = new Date(row.cooldown_until).getTime();
        if (cooldownTime > now) {
          const retryAfterSeconds = Math.max(1, Math.ceil((cooldownTime - now) / 1000));
          return {
            allowed: false,
            remaining: 0,
            retryAfterSeconds,
            message: `Too many attempts. Please try again in ${retryAfterSeconds} seconds.`,
          };
        }
      }

      // Check window expiry
      const windowStart = new Date(row.window_start).getTime();
      if (windowStart + windowMs < now) {
        return { allowed: true, remaining: maxAttempts };
      }

      const count = Number(row.count) || 0;
      if (count >= maxAttempts) {
        const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds,
          message: `Rate limit exceeded. Please try again in ${retryAfterSeconds} seconds.`,
        };
      }

      return { allowed: true, remaining: Math.max(0, maxAttempts - count) };
    } catch (err: any) {
      console.warn(`[RateLimiter] Check failed for key ${key}:`, err.message);
      // Fail open on database read errors to prevent denial of service
      return { allowed: true, remaining: 1 };
    }
  }

  /**
   * Increment attempt counter and apply temporary cooldown if thresholds are reached.
   */
  public static async increment(
    key: string,
    maxAttempts: number,
    windowMs: number,
    cooldownMs?: number
  ): Promise<RateLimitCheckResult> {
    try {
      const now = Date.now();

      // Fetch or insert row
      const selectRes = await query<any>(
        'SELECT count, window_start, cooldown_until FROM auth_rate_limits WHERE key = $1',
        [key]
      );

      let currentCount = 1;
      let applyCooldown = false;
      let effectiveCooldownMs = cooldownMs || 0;

      if (!selectRes.rows || selectRes.rows.length === 0) {
        await query(
          `INSERT INTO auth_rate_limits (key, count, window_start, updated_at)
           VALUES ($1, 1, NOW(), NOW())
           ON CONFLICT (key) DO UPDATE SET count = auth_rate_limits.count + 1, updated_at = NOW()`,
          [key]
        );
      } else {
        const row = selectRes.rows[0];
        const windowStart = new Date(row.window_start).getTime();

        if (windowStart + windowMs < now) {
          // Window expired: reset window
          currentCount = 1;
          await query(
            `UPDATE auth_rate_limits 
             SET count = 1, window_start = NOW(), cooldown_until = NULL, updated_at = NOW()
             WHERE key = $1`,
            [key]
          );
        } else {
          currentCount = Number(row.count) + 1;
          if (currentCount >= maxAttempts) {
            applyCooldown = true;
            // Progressive cooldown based on multiplier
            if (currentCount >= maxAttempts * 2) {
              effectiveCooldownMs = (cooldownMs || 300000) * 3; // 15 mins
            } else if (currentCount >= maxAttempts) {
              effectiveCooldownMs = cooldownMs || 300000; // 5 mins
            }
          }

          if (applyCooldown && effectiveCooldownMs > 0) {
            const cooldownUntil = new Date(now + effectiveCooldownMs).toISOString();
            await query(
              `UPDATE auth_rate_limits 
               SET count = $2, cooldown_until = $3, updated_at = NOW()
               WHERE key = $1`,
              [key, currentCount, cooldownUntil]
            );
          } else {
            await query(
              `UPDATE auth_rate_limits 
               SET count = $2, updated_at = NOW()
               WHERE key = $1`,
              [key, currentCount]
            );
          }
        }
      }

      if (currentCount >= maxAttempts) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((effectiveCooldownMs > 0 ? effectiveCooldownMs : windowMs) / 1000)
        );
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds,
          message: `Too many attempts. Please try again in ${retryAfterSeconds} seconds.`,
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, maxAttempts - currentCount),
      };
    } catch (err: any) {
      console.warn(`[RateLimiter] Increment failed for key ${key}:`, err.message);
      return { allowed: true, remaining: 1 };
    }
  }

  /**
   * Reset rate limit state for a key on successful authentication.
   */
  public static async reset(key: string): Promise<void> {
    try {
      await query('DELETE FROM auth_rate_limits WHERE key = $1', [key]);
    } catch (err: any) {
      console.warn(`[RateLimiter] Reset failed for key ${key}:`, err.message);
    }
  }
}

/**
 * High-level rate limit controllers
 */
export const AuthRateLimits = {
  // Login: 5 failed attempts per account per 15 minutes, with progressive cooldown (5 mins)
  LOGIN_ACCOUNT_MAX: 5,
  LOGIN_ACCOUNT_WINDOW_MS: 15 * 60 * 1000,
  LOGIN_ACCOUNT_COOLDOWN_MS: 5 * 60 * 1000,

  // IP login limits: 30 attempts per 15 mins to prevent broad spraying
  LOGIN_IP_MAX: process.env.NODE_ENV === 'test' ? 500 : 30,
  LOGIN_IP_WINDOW_MS: 15 * 60 * 1000,
  LOGIN_IP_COOLDOWN_MS: 15 * 60 * 1000,

  // Password Recovery requests: 3 per account per hour + 10 per IP per hour
  RECOVERY_ACCOUNT_MAX: 3,
  RECOVERY_ACCOUNT_WINDOW_MS: 60 * 60 * 1000,
  RECOVERY_IP_MAX: process.env.NODE_ENV === 'test' ? 500 : 10,
  RECOVERY_IP_WINDOW_MS: 60 * 60 * 1000,

  // OTP Verification attempts: 5 per challenge
  OTP_MAX_ATTEMPTS: 5,

  /**
   * Check login rate limits for both account and IP
   */
  async checkLogin(email: string, ip: string): Promise<RateLimitCheckResult> {
    const normEmail = (email || '').trim().toLowerCase();
    const accountKey = `login:account:${normEmail}`;
    const ipKey = `login:ip:${ip}`;

    const ipCheck = await DurableRateLimiter.check(ipKey, this.LOGIN_IP_MAX, this.LOGIN_IP_WINDOW_MS);
    if (!ipCheck.allowed) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: ipCheck.retryAfterSeconds,
        message: 'Too many requests from this network. Please try again later.',
      };
    }

    if (normEmail) {
      const accountCheck = await DurableRateLimiter.check(
        accountKey,
        this.LOGIN_ACCOUNT_MAX,
        this.LOGIN_ACCOUNT_WINDOW_MS
      );
      if (!accountCheck.allowed) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: accountCheck.retryAfterSeconds,
          message: `Too many failed login attempts. Please try again in ${Math.ceil((accountCheck.retryAfterSeconds || 300) / 60)} minutes.`,
        };
      }
    }

    return { allowed: true, remaining: this.LOGIN_ACCOUNT_MAX };
  },

  /**
   * Record a failed login attempt for account and IP
   */
  async recordFailedLogin(email: string, ip: string): Promise<RateLimitCheckResult> {
    const normEmail = (email || '').trim().toLowerCase();
    const accountKey = `login:account:${normEmail}`;
    const ipKey = `login:ip:${ip}`;

    await DurableRateLimiter.increment(
      ipKey,
      this.LOGIN_IP_MAX,
      this.LOGIN_IP_WINDOW_MS,
      this.LOGIN_IP_COOLDOWN_MS
    );

    if (normEmail) {
      return DurableRateLimiter.increment(
        accountKey,
        this.LOGIN_ACCOUNT_MAX,
        this.LOGIN_ACCOUNT_WINDOW_MS,
        this.LOGIN_ACCOUNT_COOLDOWN_MS
      );
    }

    return { allowed: true, remaining: 1 };
  },

  /**
   * Reset failed login counter for an account upon successful login
   */
  async resetLogin(email: string): Promise<void> {
    const normEmail = (email || '').trim().toLowerCase();
    if (normEmail) {
      await DurableRateLimiter.reset(`login:account:${normEmail}`);
    }
  },

  /**
   * Check recovery request rate limits
   */
  async checkRecovery(email: string, ip: string): Promise<RateLimitCheckResult> {
    const normEmail = (email || '').trim().toLowerCase();
    const accountKey = `recovery:account:${normEmail}`;
    const ipKey = `recovery:ip:${ip}`;

    const ipCheck = await DurableRateLimiter.check(ipKey, this.RECOVERY_IP_MAX, this.RECOVERY_IP_WINDOW_MS);
    if (!ipCheck.allowed) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: ipCheck.retryAfterSeconds,
        message: 'Too many recovery requests from this network. Please try again later.',
      };
    }

    if (normEmail) {
      const accountCheck = await DurableRateLimiter.check(
        accountKey,
        this.RECOVERY_ACCOUNT_MAX,
        this.RECOVERY_ACCOUNT_WINDOW_MS
      );
      if (!accountCheck.allowed) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: accountCheck.retryAfterSeconds,
          message: 'Too many recovery requests for this account. Please check your inbox or try again later.',
        };
      }
    }

    return { allowed: true, remaining: this.RECOVERY_ACCOUNT_MAX };
  },

  /**
   * Record recovery request dispatch
   */
  async recordRecovery(email: string, ip: string): Promise<RateLimitCheckResult> {
    const normEmail = (email || '').trim().toLowerCase();
    const accountKey = `recovery:account:${normEmail}`;
    const ipKey = `recovery:ip:${ip}`;

    await DurableRateLimiter.increment(ipKey, this.RECOVERY_IP_MAX, this.RECOVERY_IP_WINDOW_MS);
    if (normEmail) {
      return DurableRateLimiter.increment(accountKey, this.RECOVERY_ACCOUNT_MAX, this.RECOVERY_ACCOUNT_WINDOW_MS);
    }
    return { allowed: true, remaining: 1 };
  },
};
