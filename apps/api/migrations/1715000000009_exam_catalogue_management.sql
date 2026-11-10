-- Migration 009: Admin Exam Catalogue Management & Availability Controls
-- Adds active state, official date tracking, status, and display ordering to exams table

ALTER TABLE exams ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS is_date_announced BOOLEAN DEFAULT FALSE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS official_exam_date VARCHAR(64);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS current_status VARCHAR(64) DEFAULT 'DATE_NOT_ANNOUNCED';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

-- Index for ordering and active filtering
CREATE INDEX IF NOT EXISTS idx_exams_active_order ON exams (is_active, display_order ASC);
