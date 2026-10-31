# AI Crossword Maker (`aicrosswordmaker.com`)

English-only educational crossword maker: **topic → AI clues (optional) → program grid → print/PDF**.

> From a topic to a printable crossword — AI writes the clues, you edit and print.

## Stack

- **pnpm** workspace, TypeScript strict
- **Astro** SSG public SEO shell + **React** maker (`apps/web`)
- **Cloudflare Workers + Hono** API (`apps/api`), queue consumer stub (`apps/consumer`)
- **D1 / R2 / Queues** bindings prepared (migrations in `db/migrations`)
- **`@acm/crossword-engine`** pure TS grid builder + independent validator
- **`@acm/print-layout`** pdf-lib student + answer-key PDFs

## Quick start

```bash
pnpm install
pnpm test:engine
pnpm --filter @acm/print-layout test
pnpm --filter @acm/web dev
```

Open `http://localhost:4321/`.

Manual path: switch to **Words + clues** (or load sample) → **Build grid** → **Export PDF**.

API + AI Topic Demo:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
# set AI_ENABLED=true and OPENAI_API_KEY in .dev.vars (never commit)
pnpm --filter @acm/api exec wrangler d1 migrations apply acm --local
pnpm --filter @acm/api dev          # :8787
pnpm --filter @acm/web dev          # :4321 proxies /api → :8787
```

- Health: `http://localhost:8787/api/v1/health`
- Topic: homepage **Generate with AI** (same-origin `/api/v1/ai/topic`)
- Preview without Vite proxy: `PUBLIC_API_BASE_URL=http://127.0.0.1:8787 pnpm --filter @acm/web preview`
- Without keys, API returns `503` and the maker falls back to manual / examples. Use `?mock=1` only for local mock payloads.

## Monorepo

```
apps/web apps/api apps/consumer
packages/crossword-engine packages/contracts packages/print-layout packages/ui packages/config
db/migrations docs/
```

## Docs

See `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/SEO.md`, `docs/PROGRESS.md`, `AGENTS.md`.

## License / secrets

Do not commit `.env`, `.dev.vars`, or API keys.
