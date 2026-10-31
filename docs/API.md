# API

Base: `/api/v1` (Cloudflare Worker `apps/api`).

| Method | Path | Status |
| --- | --- | --- |
| GET | `/health` | Live |
| GET | `/pricing` | Live (config dump) |
| POST | `/ai/topic` | `503` without keys; `501` when enabled but provider pending; `?mock=1` local mock |

Planned: `auth`, `projects`, `entries`, `ai-jobs`, `grid-jobs`, `versions`, `packs`, `exports`, `shares`, `play/check`, `billing`, `webhooks`, `admin`.

Errors: `{ error: { code, message } }` — no stacks/secrets.
