# Data model

See `db/migrations/0001_init.sql` for the first D1 sketch:

- `users`, `sessions`
- `projects`, `puzzle_versions` (immutable snapshot JSON)
- `jobs`, `usage_ledger` (quota reserve/commit with uniqueness)
- `share_links`
- `examples_meta`

Word entries inside snapshots keep: `answer_raw`, `answer_normalized`, `display_answer`, `clue`, `origin`, `review_state`, `normalization_version`.

Billing tables (`orders`, `subscriptions`, `payment_events`, `entitlement_grants`) arrive with Phase 09.
