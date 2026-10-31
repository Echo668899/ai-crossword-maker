# AGENTS.md — AI Crossword Maker

## Product hard constraints

- **English only** — UI, SEO, examples, clues, emails. No Chinese locales or routes.
- **AI Topic is the primary path** — homepage defaults to Topic mode; manual/word-list remain real.
- **Hybrid monetization** — Free quota + Pro (month/year) + Credit Pack; keep Activity Pack option.
- **Anonymous AI Demo** — first visit can complete ≥1 Topic generate+preview (budget/Turnstile). No signup wall that kills SEO landing.
- **Not a play portal** — no daily crossword / puzzle plaza. Share play pages are `noindex`.
- GPT proposes words/clues only. **Program** owns grid, numbering, validation, entitlements, billing.
- Default domain: `https://crosswordmaker.app` (`PUBLIC_SITE_URL`).

## Repo layout

```
apps/web          Astro SSG SEO shell + React maker
apps/api          Cloudflare Worker (Hono) /api/v1/*
apps/consumer     Queue consumer Worker
packages/crossword-engine
packages/contracts
packages/print-layout
packages/ui
packages/config
db/migrations
docs/
```

## Commands

```bash
pnpm install
pnpm test:engine
pnpm --filter @acm/web dev
pnpm --filter @acm/api dev
pnpm typecheck
```

## Docs

Start with `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/SEO.md`, `docs/PROGRESS.md`.
Authoritative product constraints also live in the project store: `project-context.md` / `product-plan.md`.

## Do not

- Commit secrets (`.dev.vars`, `.env`, API keys).
- Invent search volumes, ratings, or AggregateRating schema.
- Soft-404 with SPA fallback for missing pages or API errors.
- Mark AI output as fact-verified or “Human-reviewed” without review.
