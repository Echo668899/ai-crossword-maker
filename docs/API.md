# API

Base: `/api/v1` (Cloudflare Worker `apps/api`).

| Method | Path | Status |
| --- | --- | --- |
| GET | `/health` | Live |
| GET | `/pricing` | Live (config + billing status) |
| GET | `/ai/quota` | Live — anonymous demo remaining for today |
| POST | `/ai/topic` | Live — OpenAI Responses + Structured Outputs when `AI_ENABLED=true` + `OPENAI_API_KEY`; `503` if not configured; `429` quota; `?mock=1` local mock only |
| GET | `/auth/me` | Live — session cookie → user |
| POST | `/auth/magic-link` | Live — email magic link (D1); optional `devLink` when `AUTH_DEV_RETURN_LINK=true` |
| GET | `/auth/magic-link/verify` | Live — single-use verify → HttpOnly session cookie |
| GET | `/auth/google` + `/callback` | Live when Google OAuth env set |
| POST | `/auth/logout` | Live |
| GET | `/projects` | Live — signed-in cloud projects |
| POST | `/projects` | Live — create cloud project + head version from snapshot |
| GET | `/projects/:id` | Live — project + latest snapshot (owner) |
| PATCH | `/projects/:id` | Live — title/folder/archive/snapshot; `expectedRevision` → 409 on conflict |
| GET | `/projects/:id/versions` | Live — immutable version list (plan-capped) |
| POST | `/projects/:id/versions` | Live — save snapshot version |
| GET | `/projects/:id/versions/:versionId` | Live — load snapshot (owner only) |
| GET | `/packs` | Live — activity packs + entitlement access summary |
| POST | `/packs` | Live — create pack with A/B/C layout variants (Activity Pack / Pro) |
| GET | `/packs/:id` | Live — pack detail + items |
| POST | `/packs/:id/export` | Live — queue or inline ZIP→R2 (`?sync=1`); manifest-only if FILES unbound |
| GET | `/jobs/:id` | Live — job status + download path when ready |
| GET | `/jobs/:id/download` | Live — owner download of private R2 ZIP |
| POST | `/jobs/:id/process` | Live — inline reprocess (dev/ops when consumer offline) |
| POST | `/shares` | Live — publish snapshot → unlisted share token |
| POST | `/shares/:token/revoke` | Live — owner revoke |
| GET | `/play/:token` | Live — play payload **without answers** |
| POST | `/play/:token/check` | Live — server-side letter check |
| POST | `/play/:token/reveal` | Live only if share `allowReveal` |
| GET | `/billing/status` | Live — checkout enabled? active provider (Stripe/Creem) |
| GET | `/billing/entitlements` | Live — signed-in ledger summary |
| POST | `/billing/checkout` | Live — `{ sku }` → provider Checkout URL; `503` if unconfigured; `401` if anonymous |
| POST | `/billing/portal` | Live — Stripe Customer Portal when Stripe active + customer exists |
| POST | `/billing/webhooks/stripe` | Live — signed Stripe webhooks → entitlement ledger |
| POST | `/billing/webhooks/creem` | Live — signed Creem webhooks → entitlement ledger |
| GET | `/admin/me` | Live — admin session check (`ADMIN_EMAILS`) |
| GET | `/admin/overview` | Live — aggregate counts + runtime + ops flags (no raw puzzles) |
| GET | `/admin/orders` | Live — recent orders (email for ops only) |
| GET | `/admin/jobs` | Live — recent job statuses |
| GET | `/admin/audit` | Live — admin audit trail |
| PATCH | `/admin/flags` | Live — emergency ops flags → `audit_logs` |

## Topic AI

- Request: `TopicGenerateRequest` (`topic`, `wordCount`, `difficulty`, `audience`, optional `turnstileToken`).
- Response: `{ title, themeBlurb?, entries[{answer,clue}], reviewState: "needs_review", quota?, model?, mock? }`.
- Model must not return grid/coordinates/numbering/entitlements; server assigns IDs and sanitizes A–Z answers.
- Anon daily quota: `pricing.free.anonAiDemoPerDay` (default 3) keyed by hashed IP+UA; D1 when bound, else in-memory.
- Anti-abuse: optional Turnstile (`TURNSTILE_SECRET_KEY` + `turnstileToken`); burst rate limit per IP; `TURNSTILE_REQUIRED=true` fails closed if secret missing.
- Secrets: `OPENAI_API_KEY` / `TURNSTILE_SECRET_KEY` only via Worker secrets / `.dev.vars` — never git or response bodies.
- Logs: model, request id, latency, entry counts — never raw topic text or API keys.

## Auth + share

- Sessions: Lucia/Oslo-style — cookie holds raw token; D1 `sessions.id` stores SHA-256 hex. Cookie: HttpOnly, SameSite=Lax, Secure when HTTPS.
- Magic links: single-use, ~20 min TTL, hashed at rest, email/IP rate limits.
- Share play HTML `/p/[token]/` is **noindex** and excluded from sitemap/robots; GET play never embeds answer letters.

## Packs / versions

- Creating packs requires `activity_pack` entitlement or Pro; Free gets `403 entitlement_required`.
- Variants reuse the same clues with different seeds/layouts (A/B/C…).
- Export enqueues `pack_export` (or inline with `?sync=1` / missing `JOBS`): ZIP with student PDFs + answer-key PDFs + JSON + `manifest.json` → private R2 `FILES`.
- Student JSON/PDF omit answer grids; answer-keys keep grids. Download via `/jobs/:id/download` (authz).
- Project versions are immutable snapshots with plan-based history caps; PATCH uses optimistic `expectedRevision`.

## Billing (Hybrid)

- SKUs (server whitelist): `pro_monthly`, `pro_yearly`, `credits_50`, `credits_100`, `activity_pack`.
- Provider abstraction: Stripe primary, Creem fallback; `BILLING_PROVIDER=auto|stripe|creem`.
- Checkout creates a pending `orders` row, then redirects to provider Checkout; entitlements are granted only after verified webhooks (`payment_events` unique on provider+event id).
- Secrets: `STRIPE_*` / `CREEM_*` from env only; missing keys → graceful `503` / Pricing UI disabled checkout (Free demo still works).

## Admin

- Access: signed-in user email must appear in `ADMIN_EMAILS` (comma-separated). Empty allowlist → `503 admin_unconfigured` (deny-all).
- Never returns raw word lists, clues, or secrets. Flag changes write `audit_logs`.

Planned next: production mailer, live GSC, deeper admin cost/funnel analytics.

Errors: `{ error: { code, message } }` — no stacks/secrets.
