import { Hono } from "hono";
import { cors } from "hono/cors";
import { ClueGenerateRequestSchema, TopicGenerateRequestSchema } from "@acm/contracts";
import { pricing } from "@acm/config/pricing";
import { generateCluesForAnswers, generateTopicEntries } from "./ai/provider";
import {
  clueQuotaResponse,
  consumeClueDailyQuota,
  resolveClueQuotaPolicy,
} from "./ai/clue-quota";
import {
  generateModel,
  isAiEnabled,
  isAnonDemoEnabled,
  type ApiEnv,
} from "./env";
import { consumeAnonQuota, getAnonQuota } from "./quota/anon";
import { authRoutes } from "./routes/auth";
import { billingRoutes } from "./routes/billing";
import { jobRoutes } from "./routes/jobs";
import { packRoutes } from "./routes/packs";
import { playRoutes } from "./routes/play";
import { projectRoutes } from "./routes/projects";
import { shareRoutes } from "./routes/shares";
import { versionRoutes } from "./routes/versions";
import { adminRoutes } from "./routes/admin";
import { googleEnabled } from "./auth/google";
import { mailConfigured, mailProvider } from "./auth/mailer";
import { getBillingStatus } from "./billing/provider";
import { clientIp, verifyTurnstile } from "./security/turnstile";
import { consumeRateLimit } from "./security/rate-limit";
import { adminConfigured } from "./admin/access";

const app = new Hono<{ Bindings: ApiEnv }>();

app.use(
  "*",
  cors({
    // Reflect request origin (required when credentials: true). Same-origin Vite proxy needs no CORS.
    origin: (origin) => origin || "http://127.0.0.1:4321",
    allowMethods: ["GET", "POST", "PATCH", "PUT", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.get("/api/v1/health", (c) => {
  const billing = getBillingStatus(c.env);
  return c.json({
    ok: true,
    service: "acm-api",
    planVersion: c.env.PLAN_VERSION ?? pricing.planVersion,
    aiEnabled: isAiEnabled(c.env),
    anonDemoEnabled: isAnonDemoEnabled(c.env),
    generateModel: generateModel(c.env),
    auth: {
      db: Boolean(c.env.DB),
      googleEnabled: googleEnabled(c.env),
      mailConfigured: mailConfigured(c.env),
      mailProvider: mailProvider(c.env),
    },
    billing: {
      checkoutEnabled: billing.checkoutEnabled,
      activeProvider: billing.activeProvider,
    },
    export: {
      files: Boolean(c.env.FILES),
      jobs: Boolean(c.env.JOBS),
    },
    turnstile: {
      configured: Boolean(c.env.TURNSTILE_SECRET_KEY?.trim()),
      required: c.env.TURNSTILE_REQUIRED === "true",
    },
    admin: {
      configured: adminConfigured(c.env),
    },
  });
});

app.get("/api/v1/pricing", (c) =>
  c.json({
    ...pricing,
    billing: getBillingStatus(c.env),
  }),
);

app.route("/", authRoutes);
app.route("/", billingRoutes);
app.route("/", shareRoutes);
app.route("/", projectRoutes);
app.route("/", playRoutes);
app.route("/", packRoutes);
app.route("/", versionRoutes);
app.route("/", jobRoutes);
app.route("/", adminRoutes);

app.get("/api/v1/ai/quota", async (c) => {
  const cluePolicy = await resolveClueQuotaPolicy(c.env, c.req.raw);

  // Topic / shared free pool (Pro still sees this for Topic demo ops).
  const freePool = isAnonDemoEnabled(c.env)
    ? await getAnonQuota(c.env, c.req.raw, pricing.free.aiOpsPerDay)
    : null;

  if (cluePolicy.kind === "unlimited") {
    return c.json({
      unlimited: true,
      isPro: true,
      // Keep numeric counters for Topic UI; Generate clues ignores them when unlimited.
      limit: freePool?.limit ?? null,
      remaining: freePool?.remaining ?? null,
      day: freePool?.day ?? cluePolicy.day,
      cluesUnlimited: true,
    });
  }

  if (!freePool) {
    return c.json(
      { error: { code: "demo_disabled", message: "Anonymous AI demo is disabled." } },
      403,
    );
  }
  return c.json({
    limit: freePool.limit,
    remaining: freePool.remaining,
    day: freePool.day,
    unlimited: false,
    isPro: false,
    cluesUnlimited: false,
  });
});

/**
 * Topic AI — OpenAI Responses + Structured Outputs when AI_ENABLED + OPENAI_API_KEY.
 * Mock path only for explicit ?mock=1 (local/dev). Never logs secrets or raw topic bodies.
 */
app.post("/api/v1/ai/topic", async (c) => {
  if (!isAnonDemoEnabled(c.env)) {
    return c.json(
      { error: { code: "demo_disabled", message: "Anonymous AI demo is disabled." } },
      403,
    );
  }

  const body = await c.req.json().catch(() => null);
  const parsed = TopicGenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "invalid_request", message: "Invalid topic request." } },
      400,
    );
  }

  const ip = clientIp(c.req.raw);
  const burst = await consumeRateLimit(
    c.env,
    `ai-topic:${ip || "unknown"}`,
    20,
    60_000,
  );
  if (!burst.allowed) {
    return c.json(
      {
        error: {
          code: "rate_limited",
          message: "Too many AI requests. Slow down and try again.",
        },
        resetAt: burst.resetAt,
      },
      429,
    );
  }

  const turnstile = await verifyTurnstile(c.env, parsed.data.turnstileToken, {
    ip,
    action: "ai-topic",
  });
  if (!turnstile.ok) {
    return c.json(
      { error: { code: turnstile.code, message: turnstile.message } },
      403,
    );
  }

  const preQuota = await getAnonQuota(c.env, c.req.raw);
  if (preQuota.remaining <= 0) {
    return c.json(
      {
        error: {
          code: "quota_exceeded",
          message: `Daily anonymous AI demo limit reached (${preQuota.limit}/day). Use manual mode or examples, or try again tomorrow.`,
        },
        quota: {
          limit: preQuota.limit,
          remaining: 0,
          day: preQuota.day,
        },
      },
      429,
    );
  }

  const enabled = isAiEnabled(c.env);
  const allowMock = c.req.query("mock") === "1";

  if (!enabled) {
    if (allowMock) {
      const topic = parsed.data.topic;
      const count = parsed.data.wordCount;
      const mock = mockTopicEntries(topic, count);
      const quota = await consumeAnonQuota(c.env, c.req.raw);
      if (!quota) {
        return c.json(
          {
            error: {
              code: "quota_exceeded",
              message: `Daily anonymous AI demo limit reached (${preQuota.limit}/day).`,
            },
          },
          429,
        );
      }
      return c.json({
        title: `${topic} Crossword`,
        themeBlurb: `Sample mock entries for ${topic}.`,
        entries: mock,
        reviewState: "needs_review",
        quota: { limit: quota.limit, remaining: quota.remaining, day: quota.day },
        mock: true,
      });
    }
    return c.json(
      {
        error: {
          code: "ai_not_configured",
          message:
            "AI Topic is not configured on this server (set AI_ENABLED=true and OPENAI_API_KEY). Use manual mode or examples.",
        },
      },
      503,
    );
  }

  const result = await generateTopicEntries(c.env, parsed.data);
  if (!result.ok) {
    console.error(
      JSON.stringify({
        event: "ai_topic_failed",
        code: result.error.code,
        retryable: result.error.retryable,
        model: generateModel(c.env),
      }),
    );
    const status =
      result.error.code === "rate_limited"
        ? 429
        : result.error.code === "refusal"
          ? 422
          : 502;
    return c.json(
      {
        error: {
          code: result.error.code,
          message: result.error.message,
        },
      },
      status,
    );
  }

  const quota = await consumeAnonQuota(c.env, c.req.raw);
  if (!quota) {
    return c.json(
      {
        error: {
          code: "quota_exceeded",
          message: `Daily anonymous AI demo limit reached (${preQuota.limit}/day). Use manual mode or examples.`,
        },
        quota: { limit: preQuota.limit, remaining: 0, day: preQuota.day },
      },
      429,
    );
  }

  console.log(
    JSON.stringify({
      event: "ai_topic_completed",
      model: result.value.model,
      requestId: result.value.requestId,
      latencyMs: result.value.latencyMs,
      entryCount: result.value.entries.length,
      dropped: result.value.dropped,
      quotaRemaining: quota.remaining,
    }),
  );

  return c.json({
    title: result.value.title,
    themeBlurb: result.value.themeBlurb,
    entries: result.value.entries,
    reviewState: "needs_review",
    quota: { limit: quota.limit, remaining: quota.remaining, day: quota.day },
    model: result.value.model,
    mock: false,
  });
});

/**
 * Clue AI — fill classroom clues for an existing answer list (Word list / per-entry).
 * Free / anon: daily AI ops cap. Paid Pro: unlimited (no daily consume).
 */
app.post("/api/v1/ai/clues", async (c) => {
  const cluePolicy = await resolveClueQuotaPolicy(c.env, c.req.raw);
  const paidUnlimited = cluePolicy.kind === "unlimited";

  if (!paidUnlimited && !isAnonDemoEnabled(c.env)) {
    return c.json(
      { error: { code: "demo_disabled", message: "Anonymous AI demo is disabled." } },
      403,
    );
  }

  const body = await c.req.json().catch(() => null);
  const parsed = ClueGenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "invalid_request", message: "Invalid clue request." } },
      400,
    );
  }

  const ip = clientIp(c.req.raw);
  const burst = await consumeRateLimit(
    c.env,
    `ai-clues:${ip || "unknown"}`,
    paidUnlimited ? 60 : 20,
    60_000,
  );
  if (!burst.allowed) {
    return c.json(
      {
        error: {
          code: "rate_limited",
          message: "Too many AI requests. Slow down and try again.",
        },
        resetAt: burst.resetAt,
      },
      429,
    );
  }

  // Same Turnstile action as Topic so one widget token covers both AI ops.
  const turnstile = await verifyTurnstile(c.env, parsed.data.turnstileToken, {
    ip,
    action: "ai-topic",
  });
  if (!turnstile.ok) {
    return c.json(
      { error: { code: turnstile.code, message: turnstile.message } },
      403,
    );
  }

  if (!paidUnlimited && cluePolicy.snapshot.remaining <= 0) {
    return c.json(
      {
        error: {
          code: "quota_exceeded",
          message: `Daily free Generate clues limit reached (${cluePolicy.snapshot.limit}/day). Upgrade to Pro for unlimited clues, or type clues manually.`,
        },
        quota: clueQuotaResponse(cluePolicy),
      },
      429,
    );
  }

  const enabled = isAiEnabled(c.env);
  const allowMock = c.req.query("mock") === "1";
  const dailySnapshot = cluePolicy.kind === "daily" ? cluePolicy.snapshot : null;
  const dailyLimit = dailySnapshot?.limit ?? pricing.free.aiOpsPerDay;

  async function finalizeClueQuota() {
    if (paidUnlimited || !dailySnapshot) {
      return { ok: true as const, quota: clueQuotaResponse(cluePolicy) };
    }
    const consumed = await consumeClueDailyQuota(c.env, c.req.raw);
    if (!consumed) {
      return {
        ok: false as const,
        quota: clueQuotaResponse(cluePolicy, {
          ...dailySnapshot,
          remaining: 0,
          used: dailySnapshot.limit,
        }),
      };
    }
    return { ok: true as const, quota: clueQuotaResponse(cluePolicy, consumed) };
  }

  if (!enabled) {
    if (allowMock) {
      const mock = mockCluesForAnswers(parsed.data.answers);
      const finalized = await finalizeClueQuota();
      if (!finalized.ok) {
        return c.json(
          {
            error: {
              code: "quota_exceeded",
              message: `Daily free Generate clues limit reached (${dailyLimit}/day).`,
            },
            quota: finalized.quota,
          },
          429,
        );
      }
      return c.json({
        clues: mock,
        reviewState: "needs_review",
        quota: finalized.quota,
        mock: true,
      });
    }
    return c.json(
      {
        error: {
          code: "ai_not_configured",
          message:
            "AI clues are not configured on this server (set AI_ENABLED=true and OPENAI_API_KEY). Enter clues manually.",
        },
      },
      503,
    );
  }

  const result = await generateCluesForAnswers(c.env, parsed.data);
  if (!result.ok) {
    console.error(
      JSON.stringify({
        event: "ai_clues_failed",
        code: result.error.code,
        retryable: result.error.retryable,
        model: generateModel(c.env),
        paidUnlimited,
      }),
    );
    const status =
      result.error.code === "rate_limited"
        ? 429
        : result.error.code === "refusal"
          ? 422
          : 502;
    return c.json(
      {
        error: {
          code: result.error.code,
          message: result.error.message,
        },
      },
      status,
    );
  }

  const finalized = await finalizeClueQuota();
  if (!finalized.ok) {
    return c.json(
      {
        error: {
          code: "quota_exceeded",
          message: `Daily free Generate clues limit reached (${dailyLimit}/day). Upgrade to Pro for unlimited clues.`,
        },
        quota: finalized.quota,
      },
      429,
    );
  }

  console.log(
    JSON.stringify({
      event: "ai_clues_completed",
      model: result.value.model,
      requestId: result.value.requestId,
      latencyMs: result.value.latencyMs,
      clueCount: result.value.clues.length,
      dropped: result.value.dropped,
      paidUnlimited,
      quotaRemaining: finalized.quota.remaining,
    }),
  );

  return c.json({
    clues: result.value.clues,
    reviewState: "needs_review",
    quota: finalized.quota,
    model: result.value.model,
    mock: false,
  });
});

app.notFound((c) =>
  c.json({ error: { code: "not_found", message: "API route not found" } }, 404),
);

app.onError((err, c) => {
  console.error(JSON.stringify({ event: "api_internal_error", name: err.name }));
  return c.json({ error: { code: "internal", message: "Internal error" } }, 500);
});

export default app;

function mockTopicEntries(topic: string, count: number) {
  const bank = [
    { answer: "TOPIC", clue: `Subject word related to ${topic}` },
    { answer: "LEARN", clue: "Gain knowledge" },
    { answer: "STUDY", clue: "Review material carefully" },
    { answer: "WORDS", clue: "Units of language in a puzzle" },
    { answer: "CLUE", clue: "Hint for an answer" },
    { answer: "GRID", clue: "Letter layout of the puzzle" },
    { answer: "PRINT", clue: "Send the puzzle to paper" },
    { answer: "CLASS", clue: "Group of students" },
    { answer: "QUIZ", clue: "Short test" },
    { answer: "BOOK", clue: "Bound reading material" },
    { answer: "TEACH", clue: "Help others learn" },
    { answer: "SKILL", clue: "Ability gained by practice" },
  ];
  return bank.slice(0, Math.min(count, bank.length));
}

function mockCluesForAnswers(answers: string[]) {
  const seen = new Set<string>();
  const out: Array<{ answer: string; clue: string }> = [];
  for (const raw of answers) {
    const answer = raw.toUpperCase().replace(/[^A-Z]/g, "");
    if (answer.length < 3 || answer.length > 24 || seen.has(answer)) continue;
    seen.add(answer);
    out.push({
      answer,
      clue: `Classroom clue for ${answer.charAt(0)}${"·".repeat(Math.min(answer.length - 1, 6))}`,
    });
  }
  return out;
}
