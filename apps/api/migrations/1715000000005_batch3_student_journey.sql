-- Migration 1715000000005: Batch 3 Student Journey, Test Deadlines & Result Snapshots
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS result_snapshot JSONB;
ALTER TABLE students ADD COLUMN IF NOT EXISTS completed_tasks JSONB DEFAULT '[]'::jsonb;
ALTER TABLE students ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
