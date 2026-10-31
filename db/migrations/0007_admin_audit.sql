-- Admin console skeleton: audit trail + ops kill switches.
-- Admin identity is env-gated (ADMIN_EMAILS); no invented operator roles in UI.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

CREATE TABLE IF NOT EXISTS ops_flags (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

INSERT OR IGNORE INTO ops_flags (key, value, updated_at, updated_by)
VALUES
  ('ai_anon_demo_enabled', 'true', datetime('now'), 'migration'),
  ('ai_enabled_override', 'inherit', datetime('now'), 'migration'),
  ('checkout_enabled_override', 'inherit', datetime('now'), 'migration');
