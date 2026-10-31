import { Hono, type Context } from "hono";
import type { ApiEnv } from "../env";
import { siteOrigin } from "../env";
import { validateSession } from "../auth/session";
import { getEntitlementsSummary } from "../billing/entitlements";
import {
  attachProviderSession,
  createPendingOrder,
  getBillingCustomer,
  processBillingEvent,
} from "../billing/ledger";
import {
  getBillingStatus,
  resolvePaymentProvider,
  resolveWebhookProvider,
} from "../billing/provider";
import { isCheckoutSku, type BillingProviderId } from "../billing/types";

type AppContext = Context<{ Bindings: ApiEnv }>;

export const billingRoutes = new Hono<{ Bindings: ApiEnv }>();

billingRoutes.get("/api/v1/billing/status", (c) => {
  return c.json(getBillingStatus(c.env));
});

billingRoutes.get("/api/v1/billing/entitlements", async (c) => {
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json(
      { error: { code: "unauthorized", message: "Sign in to view entitlements." } },
      401,
    );
  }
  const summary = await getEntitlementsSummary(c.env, session.user.id);
  return c.json({ authenticated: true, entitlements: summary });
});

billingRoutes.post("/api/v1/billing/checkout", async (c) => {
  const status = getBillingStatus(c.env);
  if (!status.checkoutEnabled) {
    return c.json(
      {
        error: {
          code: "billing_not_configured",
          message:
            "Checkout is disabled until a payment provider is configured (Creem preferred, Stripe fallback). Set CREEM_* or STRIPE_* secrets and product/price mappings.",
        },
        billing: status,
      },
      503,
    );
  }

  if (!c.env.DB) {
    return c.json(
      {
        error: {
          code: "db_required",
          message: "Billing requires D1. Bind DB and apply migrations.",
        },
      },
      503,
    );
  }

  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json(
      {
        error: {
          code: "unauthorized",
          message: "Sign in before starting checkout.",
        },
      },
      401,
    );
  }

  const body = await c.req.json().catch(() => null);
  const skuRaw = typeof body?.sku === "string" ? body.sku : "";
  if (!isCheckoutSku(skuRaw)) {
    return c.json(
      {
        error: {
          code: "invalid_sku",
          message: `Unknown SKU. Allowed: ${status.skus.join(", ")}`,
        },
      },
      400,
    );
  }

  const provider = resolvePaymentProvider(c.env);
  if (!provider) {
    return c.json(
      {
        error: {
          code: "billing_not_configured",
          message: "No active payment provider.",
        },
        billing: status,
      },
      503,
    );
  }

  const origin = siteOrigin(c.env);
  const successUrl =
    typeof body?.successUrl === "string" && body.successUrl.startsWith(origin)
      ? body.successUrl
      : `${origin}/app/billing/?checkout=success`;
  const cancelUrl =
    typeof body?.cancelUrl === "string" && body.cancelUrl.startsWith(origin)
      ? body.cancelUrl
      : `${origin}/pricing/?checkout=canceled`;

  try {
    const order = await createPendingOrder(c.env, {
      userId: session.user.id,
      sku: skuRaw,
      provider: provider.id,
    });
    const checkout = await provider.createCheckout({
      orderId: order.orderId,
      userId: session.user.id,
      email: session.user.email,
      sku: skuRaw,
      planVersion: order.planVersion,
      successUrl,
      cancelUrl,
    });
    await attachProviderSession(c.env, order.orderId, checkout.providerSessionId);
    return c.json({
      ok: true,
      url: checkout.url,
      orderId: order.orderId,
      provider: provider.id,
      sku: skuRaw,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    console.error(
      JSON.stringify({
        event: "billing_checkout_failed",
        provider: provider.id,
        code: message,
      }),
    );
    return c.json(
      {
        error: {
          code: "checkout_failed",
          message:
            "Could not start checkout. Verify provider credentials and price/product mappings.",
        },
      },
      502,
    );
  }
});

billingRoutes.post("/api/v1/billing/portal", async (c) => {
  const status = getBillingStatus(c.env);
  if (!status.portalEnabled) {
    return c.json(
      {
        error: {
          code: "portal_unavailable",
          message:
            "Customer portal is available when Stripe is the active provider and configured.",
        },
      },
      503,
    );
  }

  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json(
      { error: { code: "unauthorized", message: "Sign in required." } },
      401,
    );
  }

  const customerId = await getBillingCustomer(c.env, session.user.id, "stripe");
  if (!customerId) {
    return c.json(
      {
        error: {
          code: "no_customer",
          message: "No Stripe customer on file yet. Complete a checkout first.",
        },
      },
      404,
    );
  }

  const provider = resolvePaymentProvider(c.env);
  if (!provider?.createPortal) {
    return c.json(
      { error: { code: "portal_unavailable", message: "Portal not supported." } },
      503,
    );
  }

  try {
    const portal = await provider.createPortal({
      providerCustomerId: customerId,
      returnUrl: `${siteOrigin(c.env)}/app/billing/`,
    });
    return c.json({ ok: true, url: portal.url });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "billing_portal_failed",
        name: err instanceof Error ? err.name : "error",
      }),
    );
    return c.json(
      { error: { code: "portal_failed", message: "Could not open billing portal." } },
      502,
    );
  }
});

billingRoutes.post("/api/v1/billing/webhooks/stripe", (c) =>
  handleProviderWebhook(c, "stripe"),
);

billingRoutes.post("/api/v1/billing/webhooks/creem", (c) =>
  handleProviderWebhook(c, "creem"),
);

async function handleProviderWebhook(c: AppContext, providerHint: BillingProviderId) {
  if (!c.env.DB) {
    return c.json(
      { error: { code: "db_required", message: "D1 required for webhooks." } },
      503,
    );
  }

  const provider = resolveWebhookProvider(c.env, providerHint);
  if (!provider) {
    return c.json(
      {
        error: {
          code: "provider_not_configured",
          message: `${providerHint} webhook secrets are not configured.`,
        },
      },
      503,
    );
  }

  const rawBody = await c.req.text();
  try {
    const event = await provider.verifyAndParseWebhook(c.req.raw, rawBody);
    const result = await processBillingEvent(c.env, event, rawBody);
    console.log(
      JSON.stringify({
        event: "billing_webhook",
        provider: providerHint,
        rawType: event.rawType,
        kind: event.kind,
        result: result.status,
      }),
    );
    return c.json({ ok: true, result: result.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "webhook_error";
    const invalid = /INVALID_SIGNATURE|WEBHOOK_SECRET_MISSING/i.test(message);
    console.error(
      JSON.stringify({
        event: "billing_webhook_failed",
        provider: providerHint,
        code: invalid ? "invalid_signature" : "process_error",
      }),
    );
    return c.json(
      {
        error: {
          code: invalid ? "invalid_signature" : "webhook_failed",
          message: invalid ? "Invalid webhook signature." : "Webhook processing failed.",
        },
      },
      invalid ? 400 : 500,
    );
  }
}
