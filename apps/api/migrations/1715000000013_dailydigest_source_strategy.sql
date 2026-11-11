-- Migration 013: DailyDigest Adaptation - Source Strategy, Google News Discovery, Unicode Deduplication & Publisher Rights
-- Adds source groups (9 categories), Google News discovery query templates, publisher usage rights,
-- feed format detection, connectivity diagnostics, and alternative source citation tracking.

-- 1. Enhance news_sources with source groups, discovery queries, and usage permissions
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS source_group VARCHAR(64) DEFAULT 'national_governance';
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS source_type VARCHAR(32) DEFAULT 'DIRECT_FEED';
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS query_template TEXT;
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS query_keywords TEXT[] DEFAULT '{}';
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS publisher_usage_rights VARCHAR(64) DEFAULT 'FAIR_DEALING_DISCOVERY';
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS feed_format VARCHAR(32) DEFAULT 'RSS_2_0';
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS last_test_result JSONB;
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ;
ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS priority_tier INT DEFAULT 2;

-- 2. Enhance news_articles and news_drafts with feed entry IDs, original publishers, alternative sources, and review-needed flags
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS feed_entry_id TEXT;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS original_publisher TEXT;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS alternative_source_urls TEXT[] DEFAULT '{}';
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS needs_source_review BOOLEAN DEFAULT FALSE;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS article_content TEXT;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS publisher_usage_rights VARCHAR(64) DEFAULT 'FAIR_DEALING_DISCOVERY';

ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS feed_entry_id TEXT;
ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS original_publisher TEXT;
ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS alternative_source_urls TEXT[] DEFAULT '{}';
ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS needs_source_review BOOLEAN DEFAULT FALSE;
ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS article_content TEXT;
ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS publisher_usage_rights VARCHAR(64) DEFAULT 'FAIR_DEALING_DISCOVERY';

-- 3. Enhance news_fetch_jobs with review-needed counts and source group tags
ALTER TABLE news_fetch_jobs ADD COLUMN IF NOT EXISTS items_review_needed INT DEFAULT 0;
ALTER TABLE news_fetch_jobs ADD COLUMN IF NOT EXISTS source_group VARCHAR(64);

-- 4. Indices for efficient querying by source group, verification status, and editorial review
CREATE INDEX IF NOT EXISTS idx_news_sources_group ON news_sources(source_group, is_enabled);
CREATE INDEX IF NOT EXISTS idx_news_articles_review_needed ON news_articles(needs_source_review, editorial_status);
CREATE INDEX IF NOT EXISTS idx_news_drafts_review_needed ON news_drafts(needs_source_review, editorial_status);
