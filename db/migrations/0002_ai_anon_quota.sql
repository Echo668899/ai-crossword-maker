-- Anonymous AI Topic demo daily quota (Phase 05).
CREATE TABLE IF NOT EXISTS ai_anon_quota (
  fingerprint TEXT NOT NULL,
  day TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (fingerprint, day)
);

CREATE INDEX IF NOT EXISTS idx_ai_anon_quota_day ON ai_anon_quota(day);
