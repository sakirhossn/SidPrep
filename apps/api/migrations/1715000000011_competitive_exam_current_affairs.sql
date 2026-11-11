-- Migration 011: Competitive Exam Current Affairs Pipeline & Daily Quiz Schema
-- Adds support for exam tagging, static GK, practice MCQs, daily quiz attempts, and fast indices

ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS static_gk_background TEXT;
ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS practice_mcqs JSONB DEFAULT '[]';
ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS event_date DATE;
ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS why_it_matters TEXT;
ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS canonical_url TEXT;
ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS exclusion_reason TEXT;
ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS why_it_matters TEXT;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(64);
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS daily_quiz_attempts (
  id VARCHAR(64) PRIMARY KEY,
  quiz_date DATE NOT NULL,
  student_id VARCHAR(64),
  score INT NOT NULL,
  total_questions INT NOT NULL,
  answers JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_quiz_attempts_date ON daily_quiz_attempts(quiz_date, student_id);
CREATE INDEX IF NOT EXISTS idx_news_articles_event_date ON news_articles(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_editorial_event ON news_articles(editorial_status, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_news_drafts_editorial_status ON news_drafts(editorial_status, created_at DESC);
