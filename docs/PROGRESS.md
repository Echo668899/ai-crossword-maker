# PROGRESS

Updated: 2026-10-31

## Phase status

| Phase | Status |
| --- | --- |
| 01 Specs / monorepo / tokens / contracts | DONE (this commit) |
| 02 Engine + validator + tests | DONE |
| 03 Manual maker + P0 SEO shell + examples≥20 | DONE (local) |
| 04 Print layout + PDF | DONE (basic pdf-lib) |
| 05 AI provider + jobs + anon demo | DONE (sync Topic path) — OpenAI Responses + Structured Outputs + anon daily quota; queues/jobs still later |
| 06 Auth + cloud save | NOT STARTED |
| 07 Packs / batch export | NOT STARTED |
| 08 Share play | NOT STARTED |
| 09 Stripe / ledger / admin | NOT STARTED (pricing config only) |
| 10 SEO polish / deploy hardening | IN PROGRESS (shells live locally) |

## Open decisions

1. Final brand/logo lock
2. Anon demo daily quota final + Turnstile required?
3. Ship Activity Pack with Credit Pack or only one?
4. Pro yearly $72 / 100–150 ops confirm
5. `/p/*` forever noindex?
6. Examples CMS vs content collection
7. ESL vs CEFR page split (currently 301 merge)

## Blockers

- Stripe / CF production account secrets still pending for Phase 09 deploy
- Operator legal entity missing on privacy/terms/contact
- Turnstile not required yet for anon AI (open decision #2)
- Async AI jobs / Queues still stub (consumer Worker) — Topic path is synchronous for Demo

## Phase 05 notes

- `POST /api/v1/ai/topic` uses official OpenAI SDK `responses.parse` + Zod Structured Outputs (`store: false`)
- Anon quota table `ai_anon_quota` (migration `0002`); memory fallback without D1
- Web: Topic CTA calls real API; 503/429/failure degrade to manual + examples; Vite proxies `/api` in `astro dev`
- Local secrets: `apps/api/.dev.vars` (gitignored)
