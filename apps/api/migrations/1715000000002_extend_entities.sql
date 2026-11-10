-- Migration 002: Extend schema entities to align with TypeScript interfaces
-- Supports SidPrep 2.0 full persistence for exams, tests, questions, attempts, drafts, resources, pages, and jobs queue

-- 1. Exams: Add bodyCode, stagesCount, verifiedDate, sourceUrl, stages JSONB, and syllabusTree JSONB
ALTER TABLE exams ADD COLUMN IF NOT EXISTS body_code VARCHAR(32) DEFAULT 'SSC';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS stages_count INT DEFAULT 1;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS verified_date VARCHAR(32);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS source_url VARCHAR(512);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS stages JSONB DEFAULT '[]';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS syllabus_tree JSONB DEFAULT '[]';
ALTER TABLE exams DROP CONSTRAINT IF EXISTS exams_body_id_fkey;
ALTER TABLE exams ALTER COLUMN body_id DROP NOT NULL;

-- 2. Questions: Add translations JSONB for atomic query retrieval & relax topic FK to allow free-form strings
ALTER TABLE questions ADD COLUMN IF NOT EXISTS translations JSONB DEFAULT '[]';
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_topic_id_fkey;

-- 3. Tests: Add examCode, instructions JSONB, sections JSONB & relax exam_stage_id
ALTER TABLE tests ADD COLUMN IF NOT EXISTS exam_code VARCHAR(64);
ALTER TABLE tests ADD COLUMN IF NOT EXISTS instructions JSONB DEFAULT '[]';
ALTER TABLE tests ADD COLUMN IF NOT EXISTS sections JSONB DEFAULT '[]';
ALTER TABLE tests DROP CONSTRAINT IF EXISTS tests_exam_stage_id_fkey;
ALTER TABLE tests ALTER COLUMN exam_stage_id DROP NOT NULL;

-- 4. Attempts: Add durationSeconds and answers JSONB (monotonic sequence tracking)
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 0;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS answers JSONB DEFAULT '{}';
ALTER TABLE attempts DROP CONSTRAINT IF EXISTS attempts_test_id_fkey;
ALTER TABLE attempts DROP CONSTRAINT IF EXISTS attempts_student_id_fkey;

-- 5. News Drafts: Add approvedBy, approvalMode, publishedAt & relax candidate FK
ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS approved_by VARCHAR(64);
ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS approval_mode VARCHAR(32);
ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE news_drafts DROP CONSTRAINT IF EXISTS news_drafts_candidate_id_fkey;

-- 6. Resources: Add verifiedDate
ALTER TABLE resources ADD COLUMN IF NOT EXISTS verified_date VARCHAR(32);

-- 7. CMS Pages: Full dynamic page storage
CREATE TABLE IF NOT EXISTS pages (
    id VARCHAR(64) PRIMARY KEY,
    slug VARCHAR(128) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    subtitle TEXT,
    content_html TEXT NOT NULL,
    meta_title VARCHAR(255),
    meta_description TEXT,
    is_published BOOLEAN DEFAULT TRUE,
    is_system BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);

-- 8. Real PostgreSQL Job Queue (FOR UPDATE SKIP LOCKED)
CREATE TABLE IF NOT EXISTS jobs (
    id VARCHAR(64) PRIMARY KEY,
    job_type VARCHAR(64) NOT NULL,
    payload JSONB DEFAULT '{}',
    status VARCHAR(32) DEFAULT 'QUEUED', -- QUEUED, RUNNING, COMPLETED, FAILED
    scheduled_for TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    last_error TEXT,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_claim_status ON jobs(status, scheduled_for)
WHERE status = 'QUEUED';

-- 9. Email OTP challenges: Add plain text OTP and last_sent_at for dev/test verification
ALTER TABLE email_otp_challenges ADD COLUMN IF NOT EXISTS otp VARCHAR(32);
ALTER TABLE email_otp_challenges ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;
