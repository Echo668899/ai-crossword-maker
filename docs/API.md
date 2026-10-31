# API

Base: `/api/v1` (Cloudflare Worker `apps/api`).

| Method | Path | Status |
| --- | --- | --- |
| GET | `/health` | Live |
| GET | `/pricing` | Live (config dump) |
| GET | `/ai/quota` | Live — anonymous demo remaining for today |
| POST | `/ai/topic` | Live — OpenAI Responses + Structured Outputs when `AI_ENABLED=true` + `OPENAI_API_KEY`; `503` if not configured; `429` quota; `?mock=1` local mock only |
| GET | `/auth/me` | Live — session cookie → user |
| POST | `/auth/magic-link` | Live — email magic link (D1); optional `devLink` when `AUTH_DEV_RETURN_LINK=true` |
| GET | `/auth/magic-link/verify` | Live — single-use verify → HttpOnly session cookie |
| GET | `/auth/google` + `/callback` | Live when Google OAuth env set |
| POST | `/auth/logout` | Live |
| GET | `/projects` | Live — signed-in cloud projects |
| POST | `/shares` | Live — publish snapshot → unlisted share token |
| POST | `/shares/:token/revoke` | Live — owner revoke |
| GET | `/play/:token` | Live — play payload **without answers** |
| POST | `/play/:token/check` | Live — server-side letter check |
| POST | `/play/:token/reveal` | Live only if share `allowReveal` |

## Topic AI

- Request: `TopicGenerateRequest` (`topic`, `wordCount`, `difficulty`, `audience`, optional `turnstileToken`).
- Response: `{ title, themeBlurb?, entries[{answer,clue}], reviewState: "needs_review", quota?, model?, mock? }`.
- Model must not return grid/coordinates/numbering/entitlements; server assigns IDs and sanitizes A–Z answers.
- Anon daily quota: `pricing.free.anonAiDemoPerDay` (default 3) keyed by hashed IP+UA; D1 when bound, else in-memory.
- Secrets: `OPENAI_API_KEY` only via Worker secrets / `.dev.vars` — never git or response bodies.
- Logs: model, request id, latency, entry counts — never raw topic text or API keys.

## Auth + share

- Sessions: Lucia/Oslo-style — cookie holds raw token; D1 `sessions.id` stores SHA-256 hex. Cookie: HttpOnly, SameSite=Lax, Secure when HTTPS.
- Magic links: single-use, ~20 min TTL, hashed at rest, email/IP rate limits.
- Share play HTML `/p/[token]/` is **noindex** and excluded from sitemap/robots; GET play never embeds answer letters.

Planned next: fuller project CRUD, packs, billing webhooks, admin.

Errors: `{ error: { code, message } }` — no stacks/secrets.
