-- ==============================================================================
-- SIDPREP 2.0 OFFICIAL POSTGRESQL SCHEMA
-- PostgreSQL 16+ with ACID guarantees and FOR UPDATE SKIP LOCKED job queue support
-- ==============================================================================

-- 1. Students & Authentication
CREATE TABLE IF NOT EXISTS students (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(32),
    preferred_language VARCHAR(8) DEFAULT 'en',
    target_exams TEXT[] DEFAULT '{}',
    daily_goal_minutes INT DEFAULT 45,
    streak_days INT DEFAULT 0,
    status VARCHAR(32) DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, DELETED
    is_email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_sessions (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(128) NOT NULL,
    device_info JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_otp_challenges (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    otp_hash VARCHAR(128) NOT NULL,
    attempts INT DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_email_expires ON email_otp_challenges(email, expires_at);

CREATE TABLE IF NOT EXISTS student_consents (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
    consent_type VARCHAR(64) NOT NULL,
    granted BOOLEAN NOT NULL,
    policy_version VARCHAR(32) NOT NULL,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Exams, Stages, Patterns & Dual Verification
CREATE TABLE IF NOT EXISTS exam_bodies (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(32) UNIQUE NOT NULL, -- SSC, RRB, WBPSC, IBPS
    name VARCHAR(255) NOT NULL,
    official_website VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exams (
    id VARCHAR(64) PRIMARY KEY,
    body_id VARCHAR(64) REFERENCES exam_bodies(id),
    code VARCHAR(64) UNIQUE NOT NULL, -- e.g. SSC_CGL, RRB_NTPC
    name VARCHAR(255) NOT NULL,
    description TEXT,
    eligibility_notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_stages (
    id VARCHAR(64) PRIMARY KEY,
    exam_id VARCHAR(64) REFERENCES exams(id) ON DELETE CASCADE,
    stage_number INT NOT NULL,
    name VARCHAR(128) NOT NULL, -- e.g. Tier-1, Tier-2, Prelims, Mains
    duration_minutes INT NOT NULL,
    total_marks NUMERIC(6, 2) NOT NULL,
    negative_mark_ratio NUMERIC(4, 2) DEFAULT 0.25,
    section_lock_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_pattern_versions (
    id VARCHAR(64) PRIMARY KEY,
    stage_id VARCHAR(64) REFERENCES exam_stages(id),
    version_number INT NOT NULL,
    official_notification_url VARCHAR(512) NOT NULL,
    verified_date DATE NOT NULL,
    rules_payload JSONB NOT NULL,
    created_by VARCHAR(64) NOT NULL,
    approved_by VARCHAR(64), -- Dual-admin approval: must not equal created_by
    is_current BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pattern_verifications (
    id VARCHAR(64) PRIMARY KEY,
    pattern_version_id VARCHAR(64) REFERENCES exam_pattern_versions(id),
    verified_by VARCHAR(64) NOT NULL,
    verification_notes TEXT,
    status VARCHAR(32) NOT NULL, -- APPROVED, REJECTED
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Syllabus & Taxonomy
CREATE TABLE IF NOT EXISTS syllabus_topics (
    id VARCHAR(64) PRIMARY KEY,
    parent_id VARCHAR(64) REFERENCES syllabus_topics(id),
    subject VARCHAR(128) NOT NULL, -- Quantitative Aptitude, General Intelligence, etc.
    topic_name VARCHAR(128) NOT NULL,
    subtopic_name VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_topic_weights (
    id VARCHAR(64) PRIMARY KEY,
    stage_id VARCHAR(64) REFERENCES exam_stages(id),
    topic_id VARCHAR(64) REFERENCES syllabus_topics(id),
    weight_percentage NUMERIC(5, 2) NOT NULL,
    estimated_questions INT DEFAULT 1
);

-- 4. Question Bank & Multilingual Support
CREATE TABLE IF NOT EXISTS questions (
    id VARCHAR(64) PRIMARY KEY,
    topic_id VARCHAR(64) REFERENCES syllabus_topics(id),
    difficulty VARCHAR(32) DEFAULT 'MEDIUM', -- EASY, MEDIUM, HARD
    pyq_year INT,
    pyq_exam VARCHAR(64),
    pyq_shift VARCHAR(64),
    correct_option_id VARCHAR(64) NOT NULL,
    created_by VARCHAR(64) NOT NULL,
    status VARCHAR(32) DEFAULT 'REVIEWED', -- DRAFT, REVIEWED, PUBLISHED, ARCHIVED
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS question_translations (
    id VARCHAR(64) PRIMARY KEY,
    question_id VARCHAR(64) REFERENCES questions(id) ON DELETE CASCADE,
    language VARCHAR(8) NOT NULL, -- en, hi, bn
    question_text TEXT NOT NULL,
    explanation TEXT,
    options JSONB NOT NULL, -- [{id: 'opt1', text: '...'}, {id: 'opt2', text: '...'}]
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS question_reviews (
    id VARCHAR(64) PRIMARY KEY,
    question_id VARCHAR(64) REFERENCES questions(id) ON DELETE CASCADE,
    reviewer_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tests, Mock Catalogue & Attempts
CREATE TABLE IF NOT EXISTS tests (
    id VARCHAR(64) PRIMARY KEY,
    exam_stage_id VARCHAR(64) REFERENCES exam_stages(id),
    title VARCHAR(255) NOT NULL,
    type VARCHAR(32) NOT NULL, -- FULL, SECTIONAL, TOPIC, PYQ
    total_questions INT NOT NULL,
    total_marks NUMERIC(6, 2) NOT NULL,
    duration_minutes INT NOT NULL,
    is_free BOOLEAN DEFAULT TRUE,
    is_published BOOLEAN DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS test_sections (
    id VARCHAR(64) PRIMARY KEY,
    test_id VARCHAR(64) REFERENCES tests(id) ON DELETE CASCADE,
    title VARCHAR(128) NOT NULL,
    sequence_order INT NOT NULL,
    duration_minutes INT,
    section_lock BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS test_questions (
    id VARCHAR(64) PRIMARY KEY,
    test_section_id VARCHAR(64) REFERENCES test_sections(id) ON DELETE CASCADE,
    question_id VARCHAR(64) REFERENCES questions(id),
    sequence_order INT NOT NULL,
    positive_marks NUMERIC(4, 2) NOT NULL,
    negative_marks NUMERIC(4, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
    id VARCHAR(64) PRIMARY KEY,
    test_id VARCHAR(64) REFERENCES tests(id),
    student_id VARCHAR(64) REFERENCES students(id),
    status VARCHAR(32) DEFAULT 'IN_PROGRESS', -- IN_PROGRESS, SUBMITTED, EXPIRED
    score NUMERIC(6, 2) DEFAULT 0,
    max_score NUMERIC(6, 2) NOT NULL,
    accuracy NUMERIC(5, 2) DEFAULT 0,
    time_spent_seconds INT DEFAULT 0,
    correct_count INT DEFAULT 0,
    wrong_count INT DEFAULT 0,
    unattempted_count INT DEFAULT 0,
    section_breakdown JSONB DEFAULT '[]',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    submitted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS attempt_answers (
    id VARCHAR(64) PRIMARY KEY,
    attempt_id VARCHAR(64) REFERENCES attempts(id) ON DELETE CASCADE,
    question_id VARCHAR(64) REFERENCES questions(id),
    selected_option_id VARCHAR(64),
    client_sequence INT NOT NULL,
    is_marked_for_review BOOLEAN DEFAULT FALSE,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS study_plans (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
    exam_id VARCHAR(64) REFERENCES exams(id),
    tasks JSONB NOT NULL,
    daily_goal_minutes INT DEFAULT 45,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Current Affairs Pipeline (Asia/Kolkata)
CREATE TABLE IF NOT EXISTS current_affairs_sources (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    feed_url VARCHAR(512) UNIQUE NOT NULL,
    source_type VARCHAR(32) DEFAULT 'RSS', -- RSS, ATOM, API
    is_enabled BOOLEAN DEFAULT TRUE,
    allowed_categories TEXT[] DEFAULT '{}',
    target_exams TEXT[] DEFAULT '{}',
    fetch_interval_minutes INT DEFAULT 180,
    last_fetched_at TIMESTAMPTZ,
    last_etag VARCHAR(128),
    last_modified_header VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news_fetch_runs (
    id VARCHAR(64) PRIMARY KEY,
    source_id VARCHAR(64) REFERENCES current_affairs_sources(id),
    status VARCHAR(32) NOT NULL, -- SUCCESS, FAILED, SKIPPED
    items_found INT DEFAULT 0,
    items_drafted INT DEFAULT 0,
    error_message TEXT,
    fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news_candidates (
    id VARCHAR(64) PRIMARY KEY,
    fetch_run_id VARCHAR(64) REFERENCES news_fetch_runs(id),
    source_id VARCHAR(64) REFERENCES current_affairs_sources(id),
    source_title TEXT NOT NULL,
    source_url VARCHAR(512) NOT NULL,
    content_hash VARCHAR(64) UNIQUE NOT NULL,
    published_date TIMESTAMPTZ NOT NULL,
    raw_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news_drafts (
    id VARCHAR(64) PRIMARY KEY,
    candidate_id VARCHAR(64) REFERENCES news_candidates(id),
    title TEXT NOT NULL,
    original_summary TEXT NOT NULL,
    category VARCHAR(64) NOT NULL,
    target_exams TEXT[] NOT NULL,
    key_facts TEXT[] DEFAULT '{}',
    source_name VARCHAR(128) NOT NULL,
    source_url VARCHAR(512) NOT NULL,
    confidence_score NUMERIC(4, 2) DEFAULT 0.90,
    editorial_status VARCHAR(32) DEFAULT 'DRAFT', -- DRAFT, IN_REVIEW, APPROVED, SCHEDULED, PUBLISHED, REJECTED
    scheduled_for TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news_revisions (
    id VARCHAR(64) PRIMARY KEY,
    draft_id VARCHAR(64) REFERENCES news_drafts(id) ON DELETE CASCADE,
    revised_by VARCHAR(64) NOT NULL,
    previous_content JSONB NOT NULL,
    new_content JSONB NOT NULL,
    revision_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news_approvals (
    id VARCHAR(64) PRIMARY KEY,
    draft_id VARCHAR(64) REFERENCES news_drafts(id),
    approved_by VARCHAR(64) NOT NULL,
    mode VARCHAR(32) NOT NULL, -- MANUAL, AUTO_RULE
    rule_id VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news_publish_rules (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    min_confidence NUMERIC(4, 2) DEFAULT 0.95,
    allowlist_sources TEXT[] NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(64) NOT NULL,
    approved_by VARCHAR(64), -- Dual-admin approval
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS published_current_affairs (
    id VARCHAR(64) PRIMARY KEY,
    draft_id VARCHAR(64) REFERENCES news_drafts(id),
    title TEXT NOT NULL,
    original_summary TEXT NOT NULL,
    category VARCHAR(64) NOT NULL,
    target_exams TEXT[] NOT NULL,
    key_facts TEXT[] DEFAULT '{}',
    source_name VARCHAR(128) NOT NULL,
    source_url VARCHAR(512) NOT NULL,
    published_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_published_ca_date ON published_current_affairs(published_at DESC);

CREATE TABLE IF NOT EXISTS daily_quizzes (
    id VARCHAR(64) PRIMARY KEY,
    quiz_date DATE UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    question_ids TEXT[] NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Resources, Previews & Download Policy
CREATE TABLE IF NOT EXISTS resources (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    exam VARCHAR(64) NOT NULL,
    subject VARCHAR(128) NOT NULL,
    file_type VARCHAR(16) NOT NULL, -- PDF, DOCX, PNG, JPEG
    file_size_bytes BIGINT NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    storage_path VARCHAR(512) NOT NULL,
    preview_allowed BOOLEAN DEFAULT TRUE,
    download_allowed BOOLEAN DEFAULT FALSE,
    offline_allowed BOOLEAN DEFAULT FALSE,
    preview_content TEXT, -- Sanitized HTML preview for DOCX or viewer metadata
    license_source VARCHAR(255) DEFAULT 'Official / Open Educational',
    is_published BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resource_versions (
    id VARCHAR(64) PRIMARY KEY,
    resource_id VARCHAR(64) REFERENCES resources(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    storage_path VARCHAR(512) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resource_access_policies (
    id VARCHAR(64) PRIMARY KEY,
    resource_id VARCHAR(64) REFERENCES resources(id) ON DELETE CASCADE,
    target_audience VARCHAR(64) DEFAULT 'ALL', -- ALL, REGISTERED, EXAM_SPECIFIC
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resource_access_events (
    id VARCHAR(64) PRIMARY KEY,
    resource_id VARCHAR(64) REFERENCES resources(id),
    user_id VARCHAR(64),
    event_type VARCHAR(32) NOT NULL, -- PREVIEW, DOWNLOAD_ATTEMPT, DOWNLOAD_GRANTED, DOWNLOAD_DENIED
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Notifications & Brevo Quota
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    target_type VARCHAR(32) NOT NULL, -- BROADCAST, EXAM_SEGMENT, INDIVIDUAL
    target_value VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    channel VARCHAR(32) DEFAULT 'IN_APP', -- IN_APP, EMAIL
    brevo_message_id VARCHAR(128),
    status VARCHAR(32) DEFAULT 'SENT',
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Admin Team, Roles, and 2FA
CREATE TABLE IF NOT EXISTS admin_users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL, -- SUPER_ADMIN, CONTENT_MANAGER, EXAM_EDITOR, etc.
    totp_secret VARCHAR(64) NOT NULL,
    is_2fa_enabled BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Three-Layer Logs: Audit, Operational, Telemetry
CREATE TABLE IF NOT EXISTS audit_events (
    id VARCHAR(64) PRIMARY KEY,
    actor_id VARCHAR(64) NOT NULL,
    actor_email VARCHAR(255) NOT NULL,
    actor_role VARCHAR(32) NOT NULL,
    module VARCHAR(64) NOT NULL, -- EXAM, QUESTION, CURRENT_AFFAIRS, RESOURCE, USER, SETTING
    action VARCHAR(64) NOT NULL, -- CREATE, UPDATE, DELETE, APPROVE, PUBLISH, PERMISSION_CHANGE
    target_id VARCHAR(64),
    changes_diff JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_events(created_at DESC);

CREATE TABLE IF NOT EXISTS operational_events (
    id VARCHAR(64) PRIMARY KEY,
    service VARCHAR(64) NOT NULL, -- API, WORKER, BREVO, R2
    level VARCHAR(16) NOT NULL, -- INFO, WARN, ERROR
    message TEXT NOT NULL,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operational_time ON operational_events(created_at DESC);

CREATE TABLE IF NOT EXISTS app_telemetry_events (
    id VARCHAR(64) PRIMARY KEY,
    app_version VARCHAR(32) NOT NULL,
    os VARCHAR(16) NOT NULL,
    event_code VARCHAR(64) NOT NULL,
    correlation_id VARCHAR(64) NOT NULL,
    sanitized_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. PostgreSQL Job Queue (FOR UPDATE SKIP LOCKED)
CREATE TABLE IF NOT EXISTS job_runs (
    id VARCHAR(64) PRIMARY KEY,
    job_type VARCHAR(64) NOT NULL, -- NEWS_FETCH, NEWS_PUBLISH, QUOTA_CHECK, LOG_CLEANUP
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

CREATE INDEX IF NOT EXISTS idx_jobs_claim ON job_runs(status, scheduled_for)
WHERE status = 'QUEUED';

-- 12. System Settings & Quota Snapshots
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(128) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_quota_snapshots (
    id VARCHAR(64) PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    brevo_used_today INT DEFAULT 0,
    brevo_limit INT DEFAULT 300,
    r2_storage_bytes BIGINT DEFAULT 0,
    oracle_cpu_percent NUMERIC(5, 2) DEFAULT 0,
    oracle_memory_mb NUMERIC(8, 2) DEFAULT 0,
    api_requests_today INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
