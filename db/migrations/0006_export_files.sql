-- Pack ZIP export files (R2 keys) + job download metadata.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS export_files (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  owner_id TEXT NOT NULL REFERENCES users(id),
  pack_id TEXT REFERENCES activity_packs(id),
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_export_files_job ON export_files(job_id);
CREATE INDEX IF NOT EXISTS idx_export_files_owner ON export_files(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
