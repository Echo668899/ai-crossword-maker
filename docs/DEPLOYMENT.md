# Deployment

## Local

```bash
pnpm install
pnpm --filter @acm/web dev          # :4321
pnpm --filter @acm/api dev          # :8787
```

## Cloudflare (planned)

1. Build Astro static assets; serve via Workers Static Assets or Pages + API Worker route `/api/*`
2. Apply `db/migrations` to D1
3. Bind R2 private bucket + Queues
4. Set secrets: `OPENAI_API_KEY`, `STRIPE_*` and/or `CREEM_*` (plus mapped price/product IDs), auth/Google secrets
5. Apply `0004_billing.sql`; point Stripe/Creem webhooks to `/api/v1/billing/webhooks/{stripe|creem}`
6. Point `aicrosswordmaker.com` DNS; set `PUBLIC_SITE_URL`
7. Enable Turnstile before opening anon AI widely
8. Connect Search Console

## Rollback

Keep previous Worker version; D1 migrations must be forward-compatible or paired with backup export.
