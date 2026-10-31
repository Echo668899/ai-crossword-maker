import { Hono } from "hono";
import { cors } from "hono/cors";
import { TopicGenerateRequestSchema } from "@acm/contracts";
import { pricing } from "@acm/config/pricing";

type Env = {
  AI_ENABLED?: string;
  AI_ANON_DEMO_ENABLED?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL_GENERATE?: string;
  PUBLIC_SITE_URL?: string;
  PLAN_VERSION?: string;
};

const app = new Hono<{ Bindings: Env }>();

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
    aiEnabled: c.env.AI_ENABLED === "true",
    anonDemoEnabled: c.env.AI_ANON_DEMO_ENABLED !== "false",
  }),
);

app.get("/api/v1/pricing", (c) => c.json(pricing));

/** Topic AI — returns 503 until OPENAI_API_KEY + AI_ENABLED are set. Mock path only for explicit ?mock=1 in non-prod. */
app.post("/api/v1/ai/topic", async (c) => {
  const anonOk = c.env.AI_ANON_DEMO_ENABLED !== "false";
  if (!anonOk) {
    return c.json(
      { error: { code: "demo_disabled", message: "Anonymous AI demo is disabled." } },
      403,
    );
  }

  const body = await c.req.json().catch(() => null);
  const parsed = TopicGenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "invalid_request", message: parsed.error.message } },
      400,
    );
  }

  const enabled = c.env.AI_ENABLED === "true" && Boolean(c.env.OPENAI_API_KEY);
  const allowMock = c.req.query("mock") === "1";

  if (!enabled) {
    if (allowMock) {
      const topic = parsed.data.topic;
      const count = parsed.data.wordCount;
      const mock = mockTopicEntries(topic, count);
      return c.json({
        title: `${topic} Crossword`,
        entries: mock,
        reviewState: "needs_review",
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

  // Real OpenAI Responses API wiring lands in Phase 05 — refuse to pretend success.
  return c.json(
    {
      error: {
        code: "ai_provider_pending",
        message: "OpenAI provider adapter is not implemented in this build yet.",
      },
    },
    501,
  );
});

app.notFound((c) =>
  c.json({ error: { code: "not_found", message: "API route not found" } }, 404),
);

app.onError((err, c) => {
  console.error(err);
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
