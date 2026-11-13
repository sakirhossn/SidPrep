-- Migration 020: Permanent Staff Deletion, Deleted-Actor Attribution & Audit Tombstones

ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS actor_status VARCHAR(32) DEFAULT 'ACTIVE';
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS deleted_actor_ref JSONB;

CREATE TABLE IF NOT EXISTS admin_deletion_tombstones (
  id VARCHAR(64) PRIMARY KEY,
  deleted_admin_id VARCHAR(64) NOT NULL,
  email_redacted VARCHAR(255) NOT NULL,
  role VARCHAR(64) NOT NULL,
  deleted_by VARCHAR(64) NOT NULL,
  reason TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_deletion_tombstones_deleted_id
  ON admin_deletion_tombstones(deleted_admin_id);
