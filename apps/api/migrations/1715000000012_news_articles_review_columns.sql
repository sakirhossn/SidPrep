-- Migration 012: Ensure news_articles review and metadata columns exist
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(64);
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS why_it_matters TEXT;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
