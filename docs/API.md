# API

Base: `/api/v1` (Cloudflare Worker `apps/api`).

| Method | Path | Status |
| --- | --- | --- |
| GET | `/health` | Live |
| GET | `/pricing` | Live (config dump) |
| GET | `/ai/quota` | Live — anonymous demo remaining for today |
| POST | `/ai/topic` | Live — OpenAI Responses + Structured Outputs when `AI_ENABLED=true` + `OPENAI_API_KEY`; `503` if not configured; `429` quota; `?mock=1` local mock only |

## Topic AI

- Request: `TopicGenerateRequest` (`topic`, `wordCount`, `difficulty`, `audience`, optional `turnstileToken`).
- Response: `{ title, themeBlurb?, entries[{answer,clue}], reviewState: "needs_review", quota?, model?, mock? }`.
- Model must not return grid/coordinates/numbering/entitlements; server assigns IDs and sanitizes A–Z answers.
- Anon daily quota: `pricing.free.anonAiDemoPerDay` (default 3) keyed by hashed IP+UA; D1 when bound, else in-memory.
- Secrets: `OPENAI_API_KEY` only via Worker secrets / `.dev.vars` — never git or response bodies.
- Logs: model, request id, latency, entry counts — never raw topic text or API keys.

Planned: `auth`, `projects`, `entries`, `ai-jobs`, `grid-jobs`, `versions`, `packs`, `exports`, `shares`, `play/check`, `billing`, `webhooks`, `admin`.

Errors: `{ error: { code, message } }` — no stacks/secrets.
