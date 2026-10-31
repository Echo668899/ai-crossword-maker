import type { ApiEnv } from "../env";
import { generateId } from "../auth/crypto";
import { getSkuCatalog, planVersion } from "./catalog";
import type {
  BillingProviderId,
  CheckoutSku,
  NormalizedBillingEvent,
} from "./types";
import { isCheckoutSku } from "./types";

function requireDb(env: ApiEnv): D1Database {
  if (!env.DB) throw new Error("DB_REQUIRED");
  return env.DB;
}

export async function createPendingOrder(
  env: ApiEnv,
  input: {
    userId: string;
    sku: CheckoutSku;
    provider: BillingProviderId;
  },
): Promise<{ orderId: string; amountCents: number; planVersion: string }> {
  const db = requireDb(env);
  const catalog = getSkuCatalog(input.sku);
  const pv = planVersion(env.PLAN_VERSION);
  const orderId = generateId(16);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO orders
        (id, user_id, sku, plan_version, provider, amount_cents, currency, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .bind(
      orderId,
      input.userId,
      input.sku,
      pv,
      input.provider,
      catalog.amountCents,
      catalog.currency,
      now,
      now,
    )
    .run();
  return { orderId, amountCents: catalog.amountCents, planVersion: pv };
}

export async function attachProviderSession(
  env: ApiEnv,
  orderId: string,
  providerSessionId: string,
): Promise<void> {
  const db = requireDb(env);
  await db
    .prepare(
      `UPDATE orders SET provider_session_id = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(providerSessionId, new Date().toISOString(), orderId)
    .run();
}

export async function upsertBillingCustomer(
  env: ApiEnv,
  userId: string,
  provider: BillingProviderId,
  providerCustomerId: string,
): Promise<void> {
  const db = requireDb(env);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO billing_customers (user_id, provider, provider_customer_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         provider_customer_id = excluded.provider_customer_id,
         updated_at = excluded.updated_at`,
    )
    .bind(userId, provider, providerCustomerId, now, now)
    .run();
}

export async function getBillingCustomer(
  env: ApiEnv,
  userId: string,
  provider: BillingProviderId,
): Promise<string | null> {
  if (!env.DB) return null;
  const row = await env.DB.prepare(
    `SELECT provider_customer_id FROM billing_customers WHERE user_id = ? AND provider = ?`,
  )
    .bind(userId, provider)
    .first<{ provider_customer_id: string }>();
  return row?.provider_customer_id ?? null;
}

/**
 * Idempotent webhook processing:
 * 1) Insert payment_events with UNIQUE(provider, provider_event_id)
 * 2) On conflict → already handled → return duplicate
 * 3) Apply ledger mutations, then mark processed_at
 */
export async function processBillingEvent(
  env: ApiEnv,
  event: NormalizedBillingEvent,
  rawBody: string,
): Promise<{ status: "processed" | "duplicate" | "ignored"; orderId?: string }> {
  const db = requireDb(env);
  const now = new Date().toISOString();
  const eventRowId = generateId(12);

  try {
    await db
      .prepare(
        `INSERT INTO payment_events
          (id, provider, provider_event_id, type, order_id, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        eventRowId,
        event.provider,
        event.providerEventId,
        event.rawType,
        event.orderId ?? null,
        rawBody.slice(0, 100_000),
        now,
      )
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE|constraint/i.test(msg)) {
      return { status: "duplicate", orderId: event.orderId };
    }
    throw err;
  }

  if (event.kind === "ignored") {
    await markProcessed(db, eventRowId, now);
    return { status: "ignored", orderId: event.orderId };
  }

  if (event.kind === "checkout_paid") {
    const orderId = await applyCheckoutPaid(env, event);
    await markProcessed(db, eventRowId, now);
    return { status: "processed", orderId };
  }

  if (event.kind === "subscription_updated" || event.kind === "subscription_renewed") {
    await applySubscriptionUpsert(env, event);
    await markProcessed(db, eventRowId, now);
    return { status: "processed", orderId: event.orderId };
  }

  if (event.kind === "subscription_canceled") {
    await applySubscriptionCanceled(env, event);
    await markProcessed(db, eventRowId, now);
    return { status: "processed", orderId: event.orderId };
  }

  await markProcessed(db, eventRowId, now);
  return { status: "ignored", orderId: event.orderId };
}

async function markProcessed(db: D1Database, eventRowId: string, now: string) {
  await db
    .prepare(`UPDATE payment_events SET processed_at = ? WHERE id = ?`)
    .bind(now, eventRowId)
    .run();
}

async function loadOrder(
  db: D1Database,
  orderId: string,
): Promise<{
  id: string;
  user_id: string;
  sku: string;
  plan_version: string;
  status: string;
  provider: string;
} | null> {
  return db
    .prepare(
      `SELECT id, user_id, sku, plan_version, status, provider FROM orders WHERE id = ?`,
    )
    .bind(orderId)
    .first();
}

async function applyCheckoutPaid(
  env: ApiEnv,
  event: NormalizedBillingEvent,
): Promise<string | undefined> {
  const db = requireDb(env);
  const now = new Date().toISOString();

  let order = event.orderId ? await loadOrder(db, event.orderId) : null;

  // Fallback: locate by provider session when metadata missing
  if (!order && event.providerSessionId) {
    order = await db
      .prepare(
        `SELECT id, user_id, sku, plan_version, status, provider FROM orders
         WHERE provider = ? AND provider_session_id = ?`,
      )
      .bind(event.provider, event.providerSessionId)
      .first();
  }

  if (!order) {
    console.error(
      JSON.stringify({
        event: "billing_checkout_order_missing",
        provider: event.provider,
        providerEventId: event.providerEventId,
      }),
    );
    return event.orderId;
  }

  if (order.status === "paid") {
    return order.id;
  }

  const sku: CheckoutSku =
    event.sku && isCheckoutSku(event.sku)
      ? event.sku
      : isCheckoutSku(order.sku)
        ? order.sku
        : "credits_50";

  await db
    .prepare(
      `UPDATE orders SET
         status = 'paid',
         provider_payment_id = COALESCE(?, provider_payment_id),
         provider_session_id = COALESCE(?, provider_session_id),
         updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      event.providerPaymentId ?? null,
      event.providerSessionId ?? null,
      now,
      order.id,
    )
    .run();

  if (event.providerCustomerId) {
    await upsertBillingCustomer(
      env,
      order.user_id,
      event.provider,
      event.providerCustomerId,
    );
  }

  const catalog = getSkuCatalog(sku);
  if (catalog.mode === "subscription" && event.providerSubscriptionId) {
    await upsertSubscriptionRow(env, {
      userId: order.user_id,
      sku,
      planVersion: order.plan_version,
      provider: event.provider,
      providerSubscriptionId: event.providerSubscriptionId,
      providerCustomerId: event.providerCustomerId,
      status: "active",
      currentPeriodStart: event.currentPeriodStart,
      currentPeriodEnd: event.currentPeriodEnd,
      cancelAtPeriodEnd: false,
    });
  }

  await grantFromSku(env, {
    userId: order.user_id,
    sku,
    planVersion: order.plan_version,
    source: catalog.mode === "subscription" ? "subscription" : "order",
    sourceId:
      catalog.mode === "subscription"
        ? event.providerSubscriptionId ?? order.id
        : order.id,
    periodEnd: event.currentPeriodEnd,
  });

  return order.id;
}

async function applySubscriptionUpsert(
  env: ApiEnv,
  event: NormalizedBillingEvent,
): Promise<void> {
  if (!event.providerSubscriptionId) return;
  const db = requireDb(env);

  let userId: string | null = null;
  let sku: CheckoutSku | null = event.sku && isCheckoutSku(event.sku) ? event.sku : null;
  let pv = planVersion(env.PLAN_VERSION);

  if (event.orderId) {
    const order = await loadOrder(db, event.orderId);
    if (order) {
      userId = order.user_id;
      if (!sku && isCheckoutSku(order.sku)) sku = order.sku;
      pv = order.plan_version;
    }
  }

  if (!userId) {
    const existing = await db
      .prepare(
        `SELECT user_id, sku, plan_version FROM subscriptions
         WHERE provider = ? AND provider_subscription_id = ?`,
      )
      .bind(event.provider, event.providerSubscriptionId)
      .first<{ user_id: string; sku: string; plan_version: string }>();
    if (existing) {
      userId = existing.user_id;
      if (!sku && isCheckoutSku(existing.sku)) sku = existing.sku;
      pv = existing.plan_version;
    }
  }

  if (!userId || !sku) {
    console.error(
      JSON.stringify({
        event: "billing_subscription_user_missing",
        provider: event.provider,
        providerEventId: event.providerEventId,
      }),
    );
    return;
  }

  if (event.providerCustomerId) {
    await upsertBillingCustomer(env, userId, event.provider, event.providerCustomerId);
  }

  await upsertSubscriptionRow(env, {
    userId,
    sku,
    planVersion: pv,
    provider: event.provider,
    providerSubscriptionId: event.providerSubscriptionId,
    providerCustomerId: event.providerCustomerId,
    status: event.status ?? "active",
    currentPeriodStart: event.currentPeriodStart,
    currentPeriodEnd: event.currentPeriodEnd,
    cancelAtPeriodEnd: event.cancelAtPeriodEnd ?? false,
  });

  if (event.kind === "subscription_renewed" || event.status === "active") {
    await grantFromSku(env, {
      userId,
      sku,
      planVersion: pv,
      source: "subscription",
      sourceId: event.providerSubscriptionId,
      periodEnd: event.currentPeriodEnd,
      renewCredits: event.kind === "subscription_renewed",
    });
  }
}

async function applySubscriptionCanceled(
  env: ApiEnv,
  event: NormalizedBillingEvent,
): Promise<void> {
  if (!event.providerSubscriptionId) return;
  const db = requireDb(env);
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE subscriptions SET
         status = ?,
         cancel_at_period_end = 1,
         updated_at = ?
       WHERE provider = ? AND provider_subscription_id = ?`,
    )
    .bind(event.status ?? "canceled", now, event.provider, event.providerSubscriptionId)
    .run();
}

async function upsertSubscriptionRow(
  env: ApiEnv,
  input: {
    userId: string;
    sku: CheckoutSku;
    planVersion: string;
    provider: BillingProviderId;
    providerSubscriptionId: string;
    providerCustomerId?: string;
    status: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd: boolean;
  },
): Promise<void> {
  const db = requireDb(env);
  const now = new Date().toISOString();
  const existing = await db
    .prepare(
      `SELECT id FROM subscriptions WHERE provider = ? AND provider_subscription_id = ?`,
    )
    .bind(input.provider, input.providerSubscriptionId)
    .first<{ id: string }>();

  if (existing) {
    await db
      .prepare(
        `UPDATE subscriptions SET
           status = ?,
           current_period_start = COALESCE(?, current_period_start),
           current_period_end = COALESCE(?, current_period_end),
           cancel_at_period_end = ?,
           provider_customer_id = COALESCE(?, provider_customer_id),
           sku = ?,
           plan_version = ?,
           updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        input.status,
        input.currentPeriodStart ?? null,
        input.currentPeriodEnd ?? null,
        input.cancelAtPeriodEnd ? 1 : 0,
        input.providerCustomerId ?? null,
        input.sku,
        input.planVersion,
        now,
        existing.id,
      )
      .run();
    return;
  }

  await db
    .prepare(
      `INSERT INTO subscriptions
        (id, user_id, sku, plan_version, provider, provider_subscription_id,
         provider_customer_id, status, current_period_start, current_period_end,
         cancel_at_period_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      generateId(16),
      input.userId,
      input.sku,
      input.planVersion,
      input.provider,
      input.providerSubscriptionId,
      input.providerCustomerId ?? null,
      input.status,
      input.currentPeriodStart ?? null,
      input.currentPeriodEnd ?? null,
      input.cancelAtPeriodEnd ? 1 : 0,
      now,
      now,
    )
    .run();
}

async function grantFromSku(
  env: ApiEnv,
  input: {
    userId: string;
    sku: CheckoutSku;
    planVersion: string;
    source: "order" | "subscription";
    sourceId: string;
    periodEnd?: string;
    renewCredits?: boolean;
  },
): Promise<void> {
  const db = requireDb(env);
  const catalog = getSkuCatalog(input.sku);
  const now = new Date().toISOString();

  for (const grant of catalog.grants) {
    if (grant.kind === "ai_credits") {
      // One-shot sources: skip if credits already granted for this source_id.
      // Renewals: payment_events uniqueness is the idempotency key; always insert a period grant.
      if (!input.renewCredits) {
        const existing = await db
          .prepare(
            `SELECT id FROM entitlement_grants
             WHERE user_id = ? AND source = ? AND source_id = ? AND kind = 'ai_credits'`,
          )
          .bind(input.userId, input.source, input.sourceId)
          .first<{ id: string }>();
        if (existing) continue;
      }

      await db
        .prepare(
          `INSERT INTO entitlement_grants
            (id, user_id, source, source_id, kind, amount, remaining, project_id,
             plan_version, starts_at, ends_at, created_at)
           VALUES (?, ?, ?, ?, 'ai_credits', ?, ?, NULL, ?, ?, ?, ?)`,
        )
        .bind(
          generateId(12),
          input.userId,
          input.source,
          input.sourceId,
          grant.amount ?? 0,
          grant.amount ?? 0,
          input.planVersion,
          now,
          input.periodEnd ?? null,
          now,
        )
        .run();
      continue;
    }

    const existingFlag = await db
      .prepare(
        `SELECT id FROM entitlement_grants
         WHERE user_id = ? AND source = ? AND source_id = ? AND kind = ?`,
      )
      .bind(input.userId, input.source, input.sourceId, grant.kind)
      .first<{ id: string }>();
    if (existingFlag) continue;

    await db
      .prepare(
        `INSERT INTO entitlement_grants
          (id, user_id, source, source_id, kind, amount, remaining, project_id,
           plan_version, starts_at, ends_at, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?)`,
      )
      .bind(
        generateId(12),
        input.userId,
        input.source,
        input.sourceId,
        grant.kind,
        input.planVersion,
        now,
        input.periodEnd ?? null,
        now,
      )
      .run();
  }
}
