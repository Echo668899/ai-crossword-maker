# Data model

Migrations in `db/migrations/`:

- `0001_init.sql` — users, sessions, projects, puzzle_versions, jobs, usage_ledger, share_links, examples_meta
- `0002_ai_anon_quota.sql` — anonymous AI demo daily counters
- `0003_auth_share.sql` — user profile fields, session metadata, magic_link_tokens, oauth_accounts, auth_rate_limits, share owner_id
- `0004_billing.sql` — orders, subscriptions, payment_events, entitlement_grants, billing_customers
- `0005_packs_versions.sql` — activity_packs, pack_items, export_manifests
- `0006_export_files.sql` — export_files, rate_limit_buckets
- `0007_admin_audit.sql` — audit_logs, ops_flags (admin kill switches)

Auth sessions follow Lucia/Oslo practice: browser cookie = raw token; `sessions.id` = SHA-256 hex. Magic-link tokens are hashed, single-use, and TTL-bound.

Share snapshots live on `puzzle_versions.snapshot_json` (grid + placements + entries with answers). Public play APIs project a no-answer payload.

Billing: verified webhooks write `payment_events` (idempotent) then mark `orders` paid and insert `entitlement_grants` / upsert `subscriptions`. Provider customer IDs live in `billing_customers`.

Packs: `activity_packs` bind to a project; `pack_items` point at immutable `puzzle_versions` labeled A/B/C. `export_manifests` store sync batch-export JSON until R2 ZIP lands.

Admin: `ops_flags` hold emergency overrides (`ai_anon_demo_enabled`, `*_override=inherit|force_off`). `audit_logs` record admin actions without storing puzzle content. Admin identity is env `ADMIN_EMAILS`, not a DB role column.
