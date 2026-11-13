-- Migration 018: News Per-Source Funnel Telemetry & Detailed Rejection Reasons

CREATE TABLE IF NOT EXISTS news_fetch_source_reports (
  id VARCHAR(64) PRIMARY KEY,
  job_id VARCHAR(64) NOT NULL REFERENCES news_fetch_jobs(id) ON DELETE CASCADE,
  source_id VARCHAR(64) REFERENCES news_sources(id) ON DELETE SET NULL,
  source_name VARCHAR(255) NOT NULL,
  http_status INT DEFAULT 0,
  status_category VARCHAR(64) NOT NULL DEFAULT 'OK',
  parsed_count INT DEFAULT 0,
  in_date_range_count INT DEFAULT 0,
  duplicate_count INT DEFAULT 0,
  rejected_count INT DEFAULT 0,
  drafts_saved_count INT DEFAULT 0,
  rejection_reasons JSONB DEFAULT '[]',
  error_detail TEXT,
  latency_ms INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_source_reports_job
  ON news_fetch_source_reports(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_source_reports_source
  ON news_fetch_source_reports(source_id, status_category);
