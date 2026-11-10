-- Batch 4: Admin Operations, Real Document Storage & Dual Review Pipeline
-- Findings: F15, F16, F17, F18, F29, F30

ALTER TABLE resources ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ;
ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE news_drafts ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

ALTER TABLE exam_proposals ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE exam_proposals ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE exam_proposals ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
