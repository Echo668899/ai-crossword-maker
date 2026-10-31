-- Phase 06/08: auth sessions (Lucia/Oslo-style hashed tokens), magic links, share owner.
PRAGMA foreign_keys = ON;

-- Extend users (0001) with profile fields used by auth providers.
ALTER TABLE users ADD COLUMN name TEXT;
ALTER TABLE users ADD COLUMN image_url TEXT;
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;

-- Session cookie holds raw token; sessions.id stores SHA-256 hex of that token.
ALTER TABLE sessions ADD COLUMN user_agent TEXT;
ALTER TABLE sessions ADD COLUMN ip_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  request_ip_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_magic_link_email ON magic_link_tokens(email);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (bucket, day)
);

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_versions_project ON puzzle_versions(project_id);

ALTER TABLE share_links ADD COLUMN owner_id TEXT;

CREATE INDEX IF NOT EXISTS idx_share_owner ON share_links(owner_id);
CREATE INDEX IF NOT EXISTS idx_share_version ON share_links(version_id);
