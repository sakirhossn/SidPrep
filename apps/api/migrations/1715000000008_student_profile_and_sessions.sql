-- Migration 008: Student Profile Extensions, Session Tracking & Login IP History
-- Invariants enforced:
-- 1. Full student profile (first_name, last_name, is_single_name, phone_country_code, primary_exam_id, is_profile_complete)
-- 2. Session and IP audit tracking for students (IPv4 & IPv6 support)
-- 3. Dedicated student login history

-- 1. Profile fields on students
ALTER TABLE students ADD COLUMN IF NOT EXISTS first_name VARCHAR(128);
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_name VARCHAR(128);
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_single_name BOOLEAN DEFAULT FALSE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS phone_country_code VARCHAR(8) DEFAULT '+91';
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_phone_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS primary_exam_id VARCHAR(64);
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_profile_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS registration_ip VARCHAR(64);
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(64);
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
ALTER TABLE students ADD COLUMN IF NOT EXISTS login_source VARCHAR(16) DEFAULT 'app';

-- 2. Sessions table adjustments
ALTER TABLE student_sessions ADD COLUMN IF NOT EXISTS token_version INT DEFAULT 1;
ALTER TABLE student_sessions ADD COLUMN IF NOT EXISTS login_source VARCHAR(16) DEFAULT 'app';
ALTER TABLE student_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE student_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE student_sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_student_sessions_active ON student_sessions(student_id) WHERE revoked_at IS NULL;

-- 3. Dedicated student login history table
CREATE TABLE IF NOT EXISTS student_login_history (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    ip_address VARCHAR(64),
    login_source VARCHAR(16) DEFAULT 'app',
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_history_student ON student_login_history(student_id, created_at DESC);
