-- Migration 021: Expand news URL columns to TEXT to handle long Google News tracking and discovery URLs
ALTER TABLE news_drafts ALTER COLUMN source_url TYPE TEXT;
ALTER TABLE news_candidates ALTER COLUMN source_url TYPE TEXT;
ALTER TABLE published_current_affairs ALTER COLUMN source_url TYPE TEXT;
ALTER TABLE current_affairs_sources ALTER COLUMN feed_url TYPE TEXT;
