-- Migration 019: Question Import Batches, Row Audits & Cross-Format Deduplication Keys

ALTER TABLE questions ADD COLUMN IF NOT EXISTS external_source_id VARCHAR(128);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS content_fingerprint VARCHAR(64);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS marks NUMERIC(5,2);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS negative_marks NUMERIC(5,2);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS marks_source VARCHAR(32) DEFAULT 'FILE';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS import_batch_id VARCHAR(64);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS review_flags JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_questions_external_source_id
  ON questions(external_source_id)
  WHERE external_source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_questions_content_fingerprint
  ON questions(content_fingerprint)
  WHERE content_fingerprint IS NOT NULL;

CREATE TABLE IF NOT EXISTS question_import_batches (
  id VARCHAR(64) PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  format VARCHAR(16) NOT NULL,
  uploaded_by VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  total_rows INT DEFAULT 0,
  accepted_count INT DEFAULT 0,
  rejected_count INT DEFAULT 0,
  duplicate_count INT DEFAULT 0,
  review_needed_count INT DEFAULT 0,
  default_marks NUMERIC(5,2),
  default_negative_marks NUMERIC(5,2),
  exam_based_mapping VARCHAR(32),
  category_mappings JSONB DEFAULT '{}',
  update_existing BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS question_import_rows (
  id VARCHAR(64) PRIMARY KEY,
  batch_id VARCHAR(64) NOT NULL REFERENCES question_import_batches(id) ON DELETE CASCADE,
  row_index INT NOT NULL,
  external_source_id VARCHAR(128),
  status VARCHAR(32) NOT NULL,
  reason TEXT,
  mapped_question_id VARCHAR(64),
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_import_rows_batch
  ON question_import_rows(batch_id, row_index ASC);
