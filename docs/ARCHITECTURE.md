# Architecture

## Runtime map

| Surface | Tech | Notes |
| --- | --- | --- |
| Public pages | Astro SSG | Real HTML for SEO; React islands for maker |
| Maker | React | Same component on `/`, scene pages, `/app/new/` |
| API | Worker + Hono | `/api/v1/*` — no SPA fallback |
| Jobs | Queues + consumer | IDs only on messages; pack ZIP materialization |
| Data | D1 | Ownership, jobs, ledger, shares, export_files, audit_logs |
| Files | R2 private | Pack ZIP exports; never public bucket for private puzzles |
| Admin | `/admin` + `/api/v1/admin/*` | `ADMIN_EMAILS` allowlist; aggregates + kill switches; noindex |
| Engine | `@acm/crossword-engine` | Browser + server shared rules |

## Trust boundary

- Browser: draft IndexedDB, grid build, PDF via pdf-lib
- Server: auth, AI provider, quotas, webhooks, share answer checks
- Model output schema forbids grid/coords/entitlements/is_verified

## Routing

Astro owns HTML routes. API Worker owns `/api/*`. Missing pages are real 404s (`apps/web/src/pages/404.astro`). Share play `/p/[token]/` and `/admin/` are **noindex**, excluded from sitemap/robots; CF Pages `_redirects` rewrites unknown tokens to the play shell (200) while the play API returns 404 for bad tokens. Auth uses D1 sessions + magic link / optional Google OAuth. Hybrid billing (Creem primary / Stripe fallback) + admin skeleton are live in code; production keys remain env-gated.
