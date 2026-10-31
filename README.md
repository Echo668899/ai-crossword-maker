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

API (optional):

```bash
pnpm --filter @acm/api dev
# health: http://localhost:8787/api/v1/health
```

AI Topic returns `503` until `AI_ENABLED=true` and `OPENAI_API_KEY` are set in `apps/api/.dev.vars` (see `.dev.vars.example`). Use `?mock=1` only for local mock payloads.

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
