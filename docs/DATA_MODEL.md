# Data model

Migrations in `db/migrations/`:

- `0001_init.sql` — users, sessions, projects, puzzle_versions, jobs, usage_ledger, share_links, examples_meta
- `0002_ai_anon_quota.sql` — anonymous AI demo daily counters
- `0003_auth_share.sql` — user profile fields, session metadata, magic_link_tokens, oauth_accounts, auth_rate_limits, share owner_id
- `0004_billing.sql` — orders, subscriptions, payment_events, entitlement_grants, billing_customers

Auth sessions follow Lucia/Oslo practice: browser cookie = raw token; `sessions.id` = SHA-256 hex. Magic-link tokens are hashed, single-use, and TTL-bound.

Share snapshots live on `puzzle_versions.snapshot_json` (grid + placements + entries with answers). Public play APIs project a no-answer payload.

Billing: verified webhooks write `payment_events` (idempotent) then mark `orders` paid and insert `entitlement_grants` / upsert `subscriptions`. Provider customer IDs live in `billing_customers`.
