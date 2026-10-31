-- Activity packs + version labels (Phase 07).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS activity_packs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  base_seed INTEGER NOT NULL,
  max_variants INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_packs_owner ON activity_packs(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_packs_project ON activity_packs(project_id);

CREATE TABLE IF NOT EXISTS pack_items (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL REFERENCES activity_packs(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES puzzle_versions(id),
  label TEXT NOT NULL,
  seed INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(pack_id, label)
);

CREATE INDEX IF NOT EXISTS idx_pack_items_pack ON pack_items(pack_id, sort_order);

CREATE TABLE IF NOT EXISTS export_manifests (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  pack_id TEXT REFERENCES activity_packs(id),
  job_id TEXT REFERENCES jobs(id),
  manifest_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_export_manifests_owner ON export_manifests(owner_id, created_at DESC);
