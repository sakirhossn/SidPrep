-- Migration 017: Editable Database-Backed Taxonomy (Subject -> Topic -> Subtopic)

ALTER TABLE syllabus_topics ADD COLUMN IF NOT EXISTS level VARCHAR(16) NOT NULL DEFAULT 'TOPIC';
ALTER TABLE syllabus_topics ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE syllabus_topics ADD COLUMN IF NOT EXISTS slug VARCHAR(128);
ALTER TABLE syllabus_topics ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE syllabus_topics ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE syllabus_topics ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE syllabus_topics ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}';
ALTER TABLE syllabus_topics ADD COLUMN IF NOT EXISTS exam_mappings TEXT[] DEFAULT '{}';
ALTER TABLE syllabus_topics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill name from legacy columns if name is null
UPDATE syllabus_topics
SET name = COALESCE(subtopic_name, topic_name, subject)
WHERE name IS NULL;

-- Set level if default TOPIC needs hierarchy adjustment
UPDATE syllabus_topics
SET level = 'SUBJECT'
WHERE parent_id IS NULL AND (subtopic_name IS NULL OR subtopic_name = '');

-- Indexes for hierarchical querying and sibling ordering
CREATE INDEX IF NOT EXISTS idx_syllabus_topics_parent_sort
  ON syllabus_topics(parent_id, sort_order ASC, name ASC);

CREATE INDEX IF NOT EXISTS idx_syllabus_topics_active
  ON syllabus_topics(is_active, level);
