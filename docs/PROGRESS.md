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
| 06 Auth + cloud save | PARTIAL — magic link + Google OAuth; project CRUD + revision; **in-maker cloud Save/Load picker** |
| 07 Packs / batch export | PARTIAL — A/B/C packs + ZIP/R2 export (queue + inline); consumer processes `pack_export` |
| 08 Share play | PARTIAL — `/p/[token]/` noindex player + check/reveal APIs |
| 09 Stripe / ledger / admin | PARTIAL — Hybrid Stripe/Creem + ledger; **admin skeleton** (`/admin`, `/api/v1/admin/*`, audit + ops flags) |
| 10 SEO polish / deploy hardening | IN PROGRESS — long-tail batch-6 examples + `/vs/armored-penguin/` + social studies vocabulary how-to |

## Latest slice (product iteration)

- Merged long-tail batch-5 + Discovery Education + math how-to via PR #16 → `main` @ `5b6cda0`
- Examples: +5 human-reviewed long-tail seeds (`LONG_TAIL_BATCH_6_SLUGS`) — ecosystems, magnets, figurative language, decimals, natural resources; examples index long-tail strip
- Blog: `/blog/how-to-make-a-social-studies-vocabulary-crossword/` + catalog mesh
- SEO: honest `/vs/armored-penguin/` (FAQPage, no AggregateRating fiction); footer/pricing/blog/how-it-works/vs hub links
- Maker UX: Topic quick-picks + example seeds refreshed to batch-6; social studies how-to deep link

## Open decisions

1. Final brand/logo lock
2. Anon demo daily quota final + whether Turnstile is always required in production
3. Ship Activity Pack with Credit Pack or only one?
4. Pro yearly $72 / 100–150 ops confirm
5. `/p/*` forever noindex?
6. Examples CMS vs content collection
7. Production mailer for magic links (dev returns link when flagged)
8. Whether to keep separate ESL + CEFR URLs long-term vs consolidate after GSC data

## Blockers

- Operator legal entity missing on privacy/terms/refund/contact (**publish blocker**)
- Production Google OAuth + mail provider not wired
- Production Turnstile widget sitekey/secret not minted (code ready; env-gated)
- Live Stripe webhook soak
- Admin AI cost/funnel analytics still shallow (skeleton only)
