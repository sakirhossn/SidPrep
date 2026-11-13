-- Migration 016: Admin 7-Day Trusted Devices, Token Hash Registry & Step-Up MFA Tracking

CREATE TABLE IF NOT EXISTS admin_trusted_devices (
  id VARCHAR(64) PRIMARY KEY,
  admin_id VARCHAR(64) NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  device_label VARCHAR(255) NOT NULL,
  user_agent TEXT,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_ip_address VARCHAR(64),
  last_user_agent TEXT,
  revoked_at TIMESTAMPTZ,
  revoke_reason VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS idx_admin_trusted_devices_admin_active
  ON admin_trusted_devices(admin_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_trusted_devices_hash
  ON admin_trusted_devices(token_hash);
