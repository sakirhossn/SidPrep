-- Migration 014: Authentication Redesign, Password Security, Purpose-bound OTPs & Rate Limits

-- 1. Student Password Hash & Setup State
ALTER TABLE students ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- 2. Purpose-bound OTP Challenges and Cooldown
ALTER TABLE email_otp_challenges ADD COLUMN IF NOT EXISTS purpose VARCHAR(64) NOT NULL DEFAULT 'student_registration';
ALTER TABLE email_otp_challenges ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_otp_email_purpose ON email_otp_challenges(LOWER(email), purpose);

-- 3. Student Password Reset Tokens (Scoped strictly to students)
CREATE TABLE IF NOT EXISTS student_password_resets (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_student_resets_token ON student_password_resets(token_hash);
CREATE INDEX IF NOT EXISTS idx_student_resets_student ON student_password_resets(student_id);

-- 4. Student Password Setup Tokens (For onboarding / existing OTP-only accounts)
CREATE TABLE IF NOT EXISTS student_password_setups (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_student_setups_token ON student_password_setups(token_hash);
CREATE INDEX IF NOT EXISTS idx_student_setups_student ON student_password_setups(student_id);

-- 5. Short-lived Server-side Email Verification Grants
CREATE TABLE IF NOT EXISTS verification_grants (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    grant_hash VARCHAR(128) NOT NULL,
    purpose VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_verification_grants_email ON verification_grants(LOWER(email), purpose);
CREATE INDEX IF NOT EXISTS idx_verification_grants_hash ON verification_grants(grant_hash);

-- 6. Shared Durable Rate Limit Counters
CREATE TABLE IF NOT EXISTS auth_rate_limits (
    key VARCHAR(190) PRIMARY KEY,
    count INT NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cooldown_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_window ON auth_rate_limits(window_start);
