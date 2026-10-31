# Test plan

## Automated now

- Engine normalize/build/validate unit tests
- ≥50-seed property check (ghost-word free placements)
- pdf-lib export smoke test (`%PDF` header)
- API: AI schema, anon quota, auth crypto, billing catalog/providers, play snapshot non-leakage
- API: pack layout variants + export manifest (student files omit grids)
- Web: examples ≥20 quality (A–Z answers, placement ratio, SVG)
- Web: SEO shell (robots, redirects, no zh routes, example JSON-LD hooks)

## Required before launch (track in PROGRESS)

- Anonymous AI demo or explicit disabled degradation
- Quota ledger concurrency
- Stripe webhook idempotency
- Share page answer non-leakage
- Playwright: manual build → PDF download
- curl SEO assertions on deployed P0 pages
- Pack entitlement gating against live D1
- Turnstile when anon AI opens widely
