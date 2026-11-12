-- Migration 015: App Release Lifecycle, Device Push Tokens, and Durable Release Notifications

-- 1. Extend app_releases with lifecycle status, mandatory flags, and notification tracking
ALTER TABLE app_releases ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'DRAFT';
ALTER TABLE app_releases ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE app_releases ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ;
ALTER TABLE app_releases ADD COLUMN IF NOT EXISTS withdrawn_reason TEXT;
ALTER TABLE app_releases ADD COLUMN IF NOT EXISTS notification_enqueued_at TIMESTAMPTZ;
ALTER TABLE app_releases ADD COLUMN IF NOT EXISTS notification_job_id VARCHAR(64);
ALTER TABLE app_releases ADD COLUMN IF NOT EXISTS ota_compatible BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE app_releases ADD COLUMN IF NOT EXISTS requires_native_binary BOOLEAN NOT NULL DEFAULT true;

UPDATE app_releases
SET status = CASE WHEN is_published = true THEN 'PUBLISHED' ELSE 'DRAFT' END
WHERE is_published = true AND status = 'DRAFT';

CREATE INDEX IF NOT EXISTS idx_app_releases_lookup
  ON app_releases(platform, release_channel, status, build_number DESC);

-- 2. Device Installations & Push Token Registry
CREATE TABLE IF NOT EXISTS device_installations (
  id VARCHAR(64) PRIMARY KEY,
  device_id VARCHAR(128) NOT NULL,
  student_id VARCHAR(64) REFERENCES students(id) ON DELETE SET NULL,
  session_id VARCHAR(64),
  platform VARCHAR(20) NOT NULL,
  release_channel VARCHAR(32) NOT NULL DEFAULT 'PRODUCTION',
  app_version VARCHAR(50) NOT NULL,
  build_number INT NOT NULL DEFAULT 0,
  push_token TEXT,
  token_provider VARCHAR(32) DEFAULT 'EXPO',
  permission_status VARCHAR(32) NOT NULL DEFAULT 'UNDETERMINED',
  token_valid BOOLEAN NOT NULL DEFAULT true,
  invalidated_at TIMESTAMPTZ,
  invalid_reason TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_notified_release_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_device_install_device_platform
  ON device_installations(device_id, platform);

CREATE UNIQUE INDEX IF NOT EXISTS uq_device_install_push_token
  ON device_installations(push_token)
  WHERE push_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_install_target
  ON device_installations(platform, release_channel, token_valid, permission_status, build_number);

CREATE INDEX IF NOT EXISTS idx_device_install_student
  ON device_installations(student_id)
  WHERE student_id IS NOT NULL;

-- 3. Release Notification Deliveries (Duplicate Prevention, Retries, Provider Acceptance vs Receipt Tracking)
CREATE TABLE IF NOT EXISTS release_notification_deliveries (
  id VARCHAR(64) PRIMARY KEY,
  release_id VARCHAR(64) NOT NULL REFERENCES app_releases(id) ON DELETE CASCADE,
  job_id VARCHAR(64),
  installation_id VARCHAR(64) NOT NULL REFERENCES device_installations(id) ON DELETE CASCADE,
  push_token TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  provider_ticket_id VARCHAR(128),
  provider_receipt_status VARCHAR(64),
  error_code VARCHAR(64),
  error_message TEXT,
  next_retry_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  receipt_checked_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  tapped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_release_notif_dedupe
  ON release_notification_deliveries(release_id, installation_id);

CREATE INDEX IF NOT EXISTS idx_release_notif_status
  ON release_notification_deliveries(release_id, status);

CREATE INDEX IF NOT EXISTS idx_release_notif_retry
  ON release_notification_deliveries(status, next_retry_at)
  WHERE status IN ('PENDING', 'FAILED_RETRYABLE');

-- 4. Seed initial v2.0.3 Android release record if none exists, and bump stale 2.0.1/2.0.2 app_settings
INSERT INTO app_releases (
  id, version, build_number, min_supported_version, platform, release_channel,
  release_notes, download_url, is_published, status, is_mandatory, rollout_percentage,
  ota_compatible, requires_native_binary, published_at, created_at, updated_at
)
SELECT
  'rel_v2_0_3_android_prod',
  '2.0.3',
  203,
  '2.0.0',
  'ANDROID',
  'PRODUCTION',
  'SidPrep v2.0.3: Student password login & Argon2id security, verified email registration grants, profile session management, and automatic release notifications.',
  'https://github.com/sakirhossn/SidPrep/releases/download/v2.0.3/SidPrep-Student-v2.0.3.apk',
  true,
  'PUBLISHED',
  false,
  100,
  false,
  true,
  NOW(),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM app_releases WHERE platform = 'ANDROID' AND release_channel = 'PRODUCTION' AND build_number >= 203
);

UPDATE app_settings
SET value = jsonb_set(
      jsonb_set(
        value::jsonb,
        '{currentVersion}',
        '"2.0.3"'
      ),
      '{releaseNotes}',
      '"SidPrep v2.0.3: Student password login, verified email registration, session controls, and automatic release notifications."'
    ),
    updated_at = NOW()
WHERE key = 'app_version'
  AND (value::jsonb->>'currentVersion') IN ('2.0.0', '2.0.1', '2.0.2');
