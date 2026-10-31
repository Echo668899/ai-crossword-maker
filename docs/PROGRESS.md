# PROGRESS

Updated: 2026-10-31

## Phase status

| Phase | Status |
| --- | --- |
| 01 Specs / monorepo / tokens / contracts | DONE |
| 02 Engine + validator + tests | DONE |
| 03 Manual maker + P0 SEO shell + examples≥20 | DONE |
| 04 Print layout + PDF | DONE (basic pdf-lib) |
| 05 AI provider + jobs + anon demo | DONE (sync Topic + anon quota; queues later) |
| 06 Auth + cloud save | PARTIAL — magic link + Google OAuth + D1 sessions; share publish as cloud snapshot |
| 07 Packs / batch export | PARTIAL — A/B/C layout packs + version API + sync export manifest; ZIP/R2 queue later |
| 08 Share play | PARTIAL — `/p/[token]/` noindex player + check/reveal APIs |
| 09 Stripe / ledger / admin | PARTIAL — Hybrid Stripe+Creem checkout, webhooks, entitlements ledger; admin later |
| 10 SEO polish / deploy hardening | PARTIAL — examples FAQ/ItemList/Breadcrumb + Cloudflare deploy runbook; GSC/Turnstile later |

## GitHub

- PR #1 AI Topic — merged
- PR #2 Auth + share — merged
- PR #3 Hybrid billing — merged (`12dc06e`)
- Next: packs / SEO / deploy docs branch

## Open decisions

1. Final brand/logo lock
2. Anon demo daily quota final + Turnstile required?
3. Ship Activity Pack with Credit Pack or only one?
4. Pro yearly $72 / 100–150 ops confirm
5. `/p/*` forever noindex?
6. Examples CMS vs content collection
7. ESL vs CEFR page split (currently 301 merge)
8. Production mailer for magic links (dev returns link when flagged)

## Blockers

- Operator legal entity missing on privacy/terms/contact
- Production Google OAuth + mail provider not wired
