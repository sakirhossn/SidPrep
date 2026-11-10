-- Migration: Batch 5 - Durable Daily Quotas & Security Ledger (F19, F20, F21, F31)

CREATE TABLE IF NOT EXISTS email_quota_ledger (
    id VARCHAR(64) PRIMARY KEY,
    provider VARCHAR(64) NOT NULL DEFAULT 'brevo',
    date_ist VARCHAR(10) NOT NULL,
    sent_count INTEGER NOT NULL DEFAULT 0,
    cap_limit INTEGER NOT NULL DEFAULT 300,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_email_quota_provider_date UNIQUE (provider, date_ist)
);

CREATE INDEX IF NOT EXISTS idx_email_quota_lookup ON email_quota_ledger (provider, date_ist);

-- Seed initial quota record for today in Asia/Kolkata timezone
INSERT INTO email_quota_ledger (id, provider, date_ist, sent_count, cap_limit, updated_at)
VALUES (
    'quota_brevo_' || TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD'),
    'brevo',
    TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD'),
    0,
    300,
    NOW()
)
ON CONFLICT (provider, date_ist) DO NOTHING;
