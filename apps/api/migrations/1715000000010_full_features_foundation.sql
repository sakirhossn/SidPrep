-- Migration 010: Full Features Foundation
-- Staff RBAC invitations, real current affairs sources and pipeline,
-- support messaging, app release management, CMS revisions, student avatars & email verification

-- 1. Staff RBAC and invitation tracking
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS invited_by VARCHAR(64);
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS invitation_token VARCHAR(128);
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- 2. News Sources table
CREATE TABLE IF NOT EXISTS news_sources (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  feed_url TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  category VARCHAR(100) DEFAULT 'National',
  language VARCHAR(10) DEFAULT 'en',
  fetch_interval_minutes INT DEFAULT 60,
  parser_type VARCHAR(50) DEFAULT 'rss',
  last_fetched_at TIMESTAMPTZ,
  health_status VARCHAR(50) DEFAULT 'HEALTHY',
  consecutive_failures INT DEFAULT 0,
  error_details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. News Fetch Jobs (Durable Queue with Leases)
CREATE TABLE IF NOT EXISTS news_fetch_jobs (
  id VARCHAR(64) PRIMARY KEY,
  source_id VARCHAR(64) REFERENCES news_sources(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'QUEUED',
  lease_expires_at TIMESTAMPTZ,
  worker_id VARCHAR(64),
  retry_count INT DEFAULT 0,
  items_fetched INT DEFAULT 0,
  items_new INT DEFAULT 0,
  items_duplicate INT DEFAULT 0,
  items_rejected INT DEFAULT 0,
  items_failed INT DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_news_jobs_status_lease ON news_fetch_jobs(status, lease_expires_at);

-- 4. News Articles (Rich Exam Preparation Schema)
CREATE TABLE IF NOT EXISTS news_articles (
  id VARCHAR(64) PRIMARY KEY,
  source_id VARCHAR(64),
  source_name VARCHAR(255),
  source_url TEXT,
  canonical_url TEXT UNIQUE,
  headline TEXT NOT NULL,
  summary TEXT NOT NULL,
  event_date DATE,
  publication_date TIMESTAMPTZ,
  fetch_date TIMESTAMPTZ DEFAULT NOW(),
  category VARCHAR(100) DEFAULT 'National',
  target_exams TEXT[] DEFAULT '{}',
  syllabus_topics TEXT[] DEFAULT '{}',
  key_facts TEXT[] DEFAULT '{}',
  exam_relevance TEXT,
  static_gk_background TEXT,
  practice_mcqs JSONB DEFAULT '[]',
  language VARCHAR(10) DEFAULT 'en',
  editorial_status VARCHAR(50) DEFAULT 'DRAFT',
  scheduled_publish_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_news_editorial_status ON news_articles(editorial_status, published_at DESC);

-- 5. Support Messaging (Conversations & Messages)
CREATE TABLE IF NOT EXISTS support_conversations (
  id VARCHAR(64) PRIMARY KEY,
  student_id VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
  subject VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'OPEN',
  assigned_admin_id VARCHAR(64),
  unread_student_count INT DEFAULT 0,
  unread_admin_count INT DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_conv_student ON support_conversations(student_id, status);

CREATE TABLE IF NOT EXISTS support_messages (
  id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) REFERENCES support_conversations(id) ON DELETE CASCADE,
  sender_type VARCHAR(20) NOT NULL,
  sender_id VARCHAR(64) NOT NULL,
  sender_name VARCHAR(255),
  message_text TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  is_internal_note BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_msg_conv ON support_messages(conversation_id, created_at ASC);

-- 6. Application Releases & Version Management
CREATE TABLE IF NOT EXISTS app_releases (
  id VARCHAR(64) PRIMARY KEY,
  version VARCHAR(50) NOT NULL,
  build_number INT NOT NULL,
  min_supported_version VARCHAR(50) NOT NULL,
  platform VARCHAR(20) DEFAULT 'ANDROID',
  release_channel VARCHAR(50) DEFAULT 'PRODUCTION',
  release_notes TEXT,
  download_url TEXT NOT NULL,
  is_published BOOLEAN DEFAULT false,
  rollout_percentage INT DEFAULT 100,
  created_by VARCHAR(64),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. CMS Page Revisions
CREATE TABLE IF NOT EXISTS cms_page_revisions (
  id VARCHAR(64) PRIMARY KEY,
  page_id VARCHAR(64) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content_html TEXT NOT NULL,
  revision_number INT NOT NULL,
  created_by VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cms_rev_page ON cms_page_revisions(page_id, revision_number DESC);

-- 8. Student Profile Extensions (Avatars & Verified Email Changes)
ALTER TABLE students ADD COLUMN IF NOT EXISTS pending_email VARCHAR(255);
ALTER TABLE students ADD COLUMN IF NOT EXISTS pending_email_otp_hash VARCHAR(128);
ALTER TABLE students ADD COLUMN IF NOT EXISTS pending_email_otp_expires_at TIMESTAMPTZ;
ALTER TABLE students ADD COLUMN IF NOT EXISTS pending_email_attempts INT DEFAULT 0;
ALTER TABLE students ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS avatar_storage_path TEXT;

-- 9. Cleanup Manifests (Super Admin Audited Cleanup)
CREATE TABLE IF NOT EXISTS cleanup_manifests (
  id VARCHAR(64) PRIMARY KEY,
  actor_id VARCHAR(64) NOT NULL,
  cleanup_plan_id VARCHAR(64) NOT NULL,
  scope VARCHAR(100) NOT NULL,
  records_removed_count INT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
