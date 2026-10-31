# PROGRESS

Updated: 2026-10-31

## Phase status

| Phase | Status |
| --- | --- |
| 01 Specs / monorepo / tokens / contracts | DONE |
| 02 Engine + validator + tests | DONE |
| 03 Manual maker + P0 SEO shell + examples≥20 | DONE |
| 04 Print layout + PDF | DONE (basic pdf-lib) |
| 05 AI provider + jobs + anon demo | DONE (sync Topic + anon quota; Turnstile wired) |
| 06 Auth + cloud save | PARTIAL — magic link + Google OAuth + D1 sessions; project CRUD + revision conflict; share publish |
| 07 Packs / batch export | PARTIAL — A/B/C packs + ZIP/R2 export (queue + inline); consumer processes `pack_export` |
| 08 Share play | PARTIAL — `/p/[token]/` noindex player + check/reveal APIs |
| 09 Stripe / ledger / admin | PARTIAL — Hybrid Stripe/Creem checkout + ledger; admin UI not started |
| 10 SEO polish / deploy hardening | IN PROGRESS (shells + Playwright smoke + deploy docs) |

## Latest slice (post PR #4)

- Merged Activity packs / examples SEO / deploy docs (PR #4)
- Pack ZIP → private R2 (`FILES`) via queue (`JOBS`) or inline `?sync=1`
- Consumer Worker processes pack export jobs
- Turnstile Siteverify + burst rate limit on `/ai/topic`
- Cloud projects: `POST/GET/PATCH` with `expectedRevision` → 409
- Playwright smoke: maker sample → PDF; examples HTML

## Open decisions

1. Final brand/logo lock
2. Anon demo daily quota final + whether Turnstile is always required in production
3. Ship Activity Pack with Credit Pack or only one?
4. Pro yearly $72 / 100–150 ops confirm
5. `/p/*` forever noindex?
6. Examples CMS vs content collection
7. ESL vs CEFR page split (currently 301 merge)
8. Production mailer for magic links (dev returns link when flagged)

## Blockers

- Operator legal entity missing on privacy/terms/contact
- Production Google OAuth + mail provider not wired
- Production Turnstile widget sitekey/secret not minted (code ready; env-gated)
- Live Stripe webhook soak / admin console still open
