import { Hono } from "hono";
import { cors } from "hono/cors";
import { TopicGenerateRequestSchema } from "@acm/contracts";
import { pricing } from "@acm/config/pricing";
import { generateTopicEntries } from "./ai/provider";
import {
  generateModel,
  isAiEnabled,
  isAnonDemoEnabled,
  type ApiEnv,
} from "./env";
import { consumeAnonQuota, getAnonQuota } from "./quota/anon";

const app = new Hono<{ Bindings: ApiEnv }>();

app.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/api/v1/health", (c) =>
  c.json({
    ok: true,
    service: "acm-api",
    planVersion: c.env.PLAN_VERSION ?? pricing.planVersion,
    aiEnabled: isAiEnabled(c.env),
    anonDemoEnabled: isAnonDemoEnabled(c.env),
    generateModel: generateModel(c.env),
  }),
);

app.get("/api/v1/pricing", (c) => c.json(pricing));

app.get("/api/v1/ai/quota", async (c) => {
  if (!isAnonDemoEnabled(c.env)) {
    return c.json(
      { error: { code: "demo_disabled", message: "Anonymous AI demo is disabled." } },
      403,
    );
  }
  const quota = await getAnonQuota(c.env, c.req.raw);
  return c.json({
    limit: quota.limit,
    remaining: quota.remaining,
    day: quota.day,
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
    // Structured log — no topic text, no API key, no model prompt dump.
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
