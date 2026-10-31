import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../env";
import { validateSession } from "../auth/session";
import { adminConfigured, isAdminUser } from "../admin/access";
import { writeAuditLog } from "../admin/audit";
import { getBillingStatus } from "../billing/provider";
import { isAiEnabled, isAnonDemoEnabled } from "../env";

export const adminRoutes = new Hono<{ Bindings: ApiEnv }>();

const FlagPatchSchema = z.object({
  key: z.enum([
    "ai_anon_demo_enabled",
    "ai_enabled_override",
    "checkout_enabled_override",
  ]),
  value: z.string().min(1).max(40),
});

async function requireAdmin(c: {
  env: ApiEnv;
  req: { raw: Request };
}) {
  if (!c.env.DB) {
    return {
      error: c.json({ error: { code: "db_required", message: "D1 required." } }, 503),
    };
  }
  if (!adminConfigured(c.env)) {
    return {
      error: c.json(
        {
          error: {
            code: "admin_unconfigured",
            message: "Set ADMIN_EMAILS before using the admin console.",
          },
        },
        503,
      ),
    };
  }
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return {
      error: c.json({ error: { code: "unauthorized", message: "Sign in required." } }, 401),
    };
  }
  if (!isAdminUser(c.env, session.user)) {
    return {
      error: c.json({ error: { code: "forbidden", message: "Admin access required." } }, 403),
    };
  }
  return { session };
}

adminRoutes.get("/api/v1/admin/me", async (c) => {
  const gate = await requireAdmin(c);
  if ("error" in gate && gate.error) return gate.error;
  return c.json({
    ok: true,
    email: gate.session!.user.email,
    adminConfigured: true,
  });
});

adminRoutes.get("/api/v1/admin/overview", async (c) => {
  const gate = await requireAdmin(c);
  if ("error" in gate && gate.error) return gate.error;
  const db = c.env.DB!;

  const [
    users,
    projects,
    jobsQueued,
    jobsFailed,
    ordersPaid,
    subsActive,
    shares,
    packs,
    exportFiles,
  ] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as n FROM users`).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) as n FROM projects WHERE archived = 0`).first<{ n: number }>(),
    db
      .prepare(`SELECT COUNT(*) as n FROM jobs WHERE status IN ('queued','running','pending')`)
      .first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) as n FROM jobs WHERE status = 'failed'`).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) as n FROM orders WHERE status = 'paid'`).first<{ n: number }>(),
    db
      .prepare(`SELECT COUNT(*) as n FROM subscriptions WHERE status IN ('active','trialing')`)
      .first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) as n FROM share_links WHERE revoked = 0`).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) as n FROM activity_packs`).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) as n FROM export_files`).first<{ n: number }>(),
  ]);

  const flags = await db
    .prepare(`SELECT key, value, updated_at, updated_by FROM ops_flags ORDER BY key`)
    .all<{ key: string; value: string; updated_at: string; updated_by: string | null }>();

  const billing = getBillingStatus(c.env);

  return c.json({
    counts: {
      users: users?.n ?? 0,
      projects: projects?.n ?? 0,
      jobsQueued: jobsQueued?.n ?? 0,
      jobsFailed: jobsFailed?.n ?? 0,
      ordersPaid: ordersPaid?.n ?? 0,
      subscriptionsActive: subsActive?.n ?? 0,
      sharesOpen: shares?.n ?? 0,
      packs: packs?.n ?? 0,
      exportFiles: exportFiles?.n ?? 0,
    },
    runtime: {
      aiEnabled: isAiEnabled(c.env),
      anonDemoEnabled: isAnonDemoEnabled(c.env),
      checkoutEnabled: billing.checkoutEnabled,
      activeBillingProvider: billing.activeProvider,
      filesBound: Boolean(c.env.FILES),
      jobsBound: Boolean(c.env.JOBS),
      turnstileConfigured: Boolean(c.env.TURNSTILE_SECRET_KEY?.trim()),
      turnstileRequired: c.env.TURNSTILE_REQUIRED === "true",
    },
    flags: flags.results ?? [],
    note: "Overview aggregates only — raw word lists, clues, and secrets are never shown.",
  });
});

adminRoutes.get("/api/v1/admin/orders", async (c) => {
  const gate = await requireAdmin(c);
  if ("error" in gate && gate.error) return gate.error;
  const rows = await c.env.DB!.prepare(
    `SELECT o.id, o.sku, o.status, o.provider, o.amount_cents, o.currency, o.created_at, o.updated_at,
            u.email as user_email
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     ORDER BY o.created_at DESC
     LIMIT 50`,
  ).all<{
    id: string;
    sku: string;
    status: string;
    provider: string | null;
    amount_cents: number | null;
    currency: string | null;
    created_at: string;
    updated_at: string;
    user_email: string | null;
  }>();

  return c.json({
    orders: (rows.results ?? []).map((o) => ({
      id: o.id,
      sku: o.sku,
      status: o.status,
      provider: o.provider,
      amountCents: o.amount_cents,
      currency: o.currency,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
      // Email only for ops reconciliation — never card data.
      userEmail: o.user_email,
    })),
  });
});

adminRoutes.get("/api/v1/admin/jobs", async (c) => {
  const gate = await requireAdmin(c);
  if ("error" in gate && gate.error) return gate.error;
  const rows = await c.env.DB!.prepare(
    `SELECT id, type, status, stage, error_code, created_at, updated_at
     FROM jobs
     ORDER BY created_at DESC
     LIMIT 40`,
  ).all<{
    id: string;
    type: string;
    status: string;
    stage: string | null;
    error_code: string | null;
    created_at: string;
    updated_at: string;
  }>();

  return c.json({
    jobs: (rows.results ?? []).map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      stage: j.stage,
      errorCode: j.error_code,
      createdAt: j.created_at,
      updatedAt: j.updated_at,
    })),
  });
});

adminRoutes.get("/api/v1/admin/audit", async (c) => {
  const gate = await requireAdmin(c);
  if ("error" in gate && gate.error) return gate.error;
  const rows = await c.env.DB!.prepare(
    `SELECT id, actor_user_id, action, target_type, target_id, meta_json, created_at
     FROM audit_logs
     ORDER BY created_at DESC
     LIMIT 80`,
  ).all<{
    id: string;
    actor_user_id: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    meta_json: string | null;
    created_at: string;
  }>();

  return c.json({
    events: (rows.results ?? []).map((e) => ({
      id: e.id,
      actorUserId: e.actor_user_id,
      action: e.action,
      targetType: e.target_type,
      targetId: e.target_id,
      meta: e.meta_json ? safeJson(e.meta_json) : null,
      createdAt: e.created_at,
    })),
  });
});

adminRoutes.patch("/api/v1/admin/flags", async (c) => {
  const gate = await requireAdmin(c);
  if ("error" in gate && gate.error) return gate.error;
  const body = await c.req.json().catch(() => null);
  const parsed = FlagPatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "invalid_request", message: "Invalid flag patch." } }, 400);
  }

  const allowedValues: Record<string, string[]> = {
    ai_anon_demo_enabled: ["true", "false"],
    ai_enabled_override: ["inherit", "force_off"],
    checkout_enabled_override: ["inherit", "force_off"],
  };
  const allowed = allowedValues[parsed.data.key] ?? [];
  if (!allowed.includes(parsed.data.value)) {
    return c.json(
      {
        error: {
          code: "invalid_value",
          message: `Allowed values for ${parsed.data.key}: ${allowed.join(", ")}`,
        },
      },
      400,
    );
  }

  const now = new Date().toISOString();
  await c.env.DB!.prepare(
    `INSERT INTO ops_flags (key, value, updated_at, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  )
    .bind(parsed.data.key, parsed.data.value, now, gate.session!.user.id)
    .run();

  await writeAuditLog(c.env, {
    actorUserId: gate.session!.user.id,
    action: "ops_flag_updated",
    targetType: "ops_flag",
    targetId: parsed.data.key,
    meta: { value: parsed.data.value },
  });

  return c.json({
    key: parsed.data.key,
    value: parsed.data.value,
    updatedAt: now,
  });
});

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
