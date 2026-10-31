import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../env";
import {
  checkLetters,
  PuzzleSnapshotSchema,
  revealGrid,
  toPlayPayload,
  type PuzzleSnapshot,
} from "../play/snapshot";

export const playRoutes = new Hono<{ Bindings: ApiEnv }>();

type ShareRow = {
  token: string;
  version_id: string;
  expires_at: string | null;
  revoked: number;
  allow_check: number;
  allow_reveal: number;
  snapshot_json: string;
  title: string;
};

async function loadShare(
  env: ApiEnv,
  token: string,
): Promise<{ row: ShareRow; snapshot: PuzzleSnapshot } | { error: string; status: 404 | 410 }> {
  if (!env.DB) {
    return { error: "db_required", status: 404 };
  }
  const row = await env.DB.prepare(
    `SELECT s.token, s.version_id, s.expires_at, s.revoked, s.allow_check, s.allow_reveal,
            v.snapshot_json, p.title
     FROM share_links s
     JOIN puzzle_versions v ON v.id = s.version_id
     JOIN projects p ON p.id = s.project_id
     WHERE s.token = ?`,
  )
    .bind(token)
    .first<ShareRow>();

  if (!row || row.revoked) {
    return { error: "not_found", status: 404 };
  }
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return { error: "expired", status: 410 };
  }

  let json: unknown;
  try {
    json = JSON.parse(row.snapshot_json);
  } catch {
    return { error: "corrupt", status: 404 };
  }
  const parsed = PuzzleSnapshotSchema.safeParse(json);
  if (!parsed.success) {
    return { error: "corrupt", status: 404 };
  }
  return { row, snapshot: parsed.data };
}

playRoutes.get("/api/v1/play/:token", async (c) => {
  const token = c.req.param("token");
  const loaded = await loadShare(c.env, token);
  if ("error" in loaded) {
    const message =
      loaded.error === "expired"
        ? "This share link has expired."
        : loaded.error === "db_required"
          ? "Play API requires D1."
          : "Share link not found or revoked.";
    return c.json(
      { error: { code: loaded.error === "expired" ? "expired" : "not_found", message } },
      loaded.status,
    );
  }

  // Cache-conscious: private shares must not leak via shared caches.
  c.header("Cache-Control", "private, no-store");
  return c.json(
    toPlayPayload(loaded.snapshot, {
      token: loaded.row.token,
      title: loaded.row.title,
      allowCheck: Boolean(loaded.row.allow_check),
      allowReveal: Boolean(loaded.row.allow_reveal),
      expiresAt: loaded.row.expires_at,
    }),
  );
});

const CheckSchema = z.object({
  guesses: z
    .array(
      z.object({
        row: z.number().int().nonnegative(),
        col: z.number().int().nonnegative(),
        letter: z.string().min(1).max(2),
      }),
    )
    .min(1)
    .max(900),
});

playRoutes.post("/api/v1/play/:token/check", async (c) => {
  const token = c.req.param("token");
  const loaded = await loadShare(c.env, token);
  if ("error" in loaded) {
    return c.json(
      { error: { code: "not_found", message: "Share link not found or revoked." } },
      loaded.status,
    );
  }
  if (!loaded.row.allow_check) {
    return c.json(
      { error: { code: "check_disabled", message: "Checking answers is disabled for this share." } },
      403,
    );
  }

  const body = await c.req.json().catch(() => null);
  const parsed = CheckSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "invalid_request", message: "Invalid check payload." } }, 400);
  }

  c.header("Cache-Control", "private, no-store");
  return c.json(checkLetters(loaded.snapshot, parsed.data.guesses));
});

playRoutes.post("/api/v1/play/:token/reveal", async (c) => {
  const token = c.req.param("token");
  const loaded = await loadShare(c.env, token);
  if ("error" in loaded) {
    return c.json(
      { error: { code: "not_found", message: "Share link not found or revoked." } },
      loaded.status,
    );
  }
  if (!loaded.row.allow_reveal) {
    return c.json(
      {
        error: {
          code: "reveal_disabled",
          message: "Reveal is disabled for this share. Answers are not available via the API.",
        },
      },
      403,
    );
  }
  c.header("Cache-Control", "private, no-store");
  return c.json(revealGrid(loaded.snapshot));
});
