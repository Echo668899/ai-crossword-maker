# Test plan

## Automated now

- Engine normalize/build/validate unit tests
- ≥50-seed property check (ghost-word free placements)
- pdf-lib export smoke test (`%PDF` header)
- Pack ZIP (`PK` header) + student/answer-key file kinds
- API: AI schema, anon quota, auth crypto, billing catalog/providers, play snapshot non-leakage
- API: pack layout variants + export manifest (student files omit grids)
- API: Turnstile siteverify + burst rate limit
- API: project CRUD schema / expectedRevision contract
- API: admin `ADMIN_EMAILS` allowlist gate
- Web: snapshot hydrate (cloud reload without re-solve)
- Web: examples ≥20 quality (A–Z answers, placement ratio, SVG)
- Web: SEO shell (robots incl. `/admin/`, redirects, no zh routes, legal TO-BE-FILLED placeholders)
- Playwright smoke (`pnpm test:e2e`): home maker sample → PDF; examples HTML

## Required before launch (track in PROGRESS)

- Anonymous AI demo or explicit disabled degradation
- Quota ledger concurrency
- Stripe webhook idempotency
- Share page answer non-leakage
- curl SEO assertions on deployed P0 pages
- Pack entitlement gating against live D1
- Production Turnstile widget + `TURNSTILE_REQUIRED=true`
- Operator legal entity filled on Privacy/Terms/Refund/Contact
- Admin allowlist + incident flag drill
