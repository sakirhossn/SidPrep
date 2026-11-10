-- Migration 003: Batch 1 Auth Hardening & Security Controls
-- Supports token versioning for session revocation, admin password reset workflows, and secure OTP hashing

-- 1. Token Versioning for Session Revocation (F07)
ALTER TABLE students ADD COLUMN IF NOT EXISTS token_version INT DEFAULT 1;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS token_version INT DEFAULT 1;

-- 2. Admin Password Reset Single-Use Tokens (F03)
CREATE TABLE IF NOT EXISTS admin_password_resets (
    id VARCHAR(64) PRIMARY KEY,
    admin_id VARCHAR(64) NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_resets_token ON admin_password_resets(token_hash);

-- 3. OTP Hardening & Uniqueness (F22)
ALTER TABLE email_otp_challenges ADD COLUMN IF NOT EXISTS otp_hash VARCHAR(128);
CREATE INDEX IF NOT EXISTS idx_otp_email_active ON email_otp_challenges(LOWER(email)) WHERE consumed_at IS NULL;
