import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../env";
import { generateToken } from "../auth/crypto";
import { validateSession } from "../auth/session";
import { PuzzleSnapshotSchema } from "../play/snapshot";
import { pricing } from "@acm/config/pricing";

export const shareRoutes = new Hono<{ Bindings: ApiEnv }>();

const PublishSchema = z.object({
  title: z.string().min(1).max(200).default("Shared crossword"),
  allowCheck: z.boolean().default(true),
  allowReveal: z.boolean().default(false),
  /** ISO expiry; omit for no expiry */
  expiresAt: z.string().datetime().optional().nullable(),
  snapshot: PuzzleSnapshotSchema,
});

shareRoutes.post("/api/v1/shares", async (c) => {
  if (!c.env.DB) {
    return c.json(
      { error: { code: "db_required", message: "Sharing requires D1. Apply migrations and bind DB." } },
      503,
    );
  }
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json(
      { error: { code: "unauthorized", message: "Sign in to create a share link." } },
      401,
    );
  }

  const body = await c.req.json().catch(() => null);
  const parsed = PublishSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "invalid_request", message: "Invalid share payload." } },
      400,
    );
  }

  const maxProjects = pricing.free.loggedInCloudProjects;
  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM projects WHERE owner_id = ? AND archived = 0`,
  )
    .bind(session.user.id)
    .first<{ n: number }>();
  if ((countRow?.n ?? 0) >= maxProjects) {
    return c.json(
      {
        error: {
          code: "project_limit",
          message: `Free plan allows ${maxProjects} cloud projects. Archive one or upgrade later.`,
        },
      },
      403,
    );
  }

  const now = new Date().toISOString();
  const projectId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const token = generateToken(18);
  const snap = parsed.data.snapshot;
  const title = parsed.data.title || snap.title;

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO projects (id, owner_id, title, folder, archived, revision, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 0, 1, ?, ?)`,
    ).bind(projectId, session.user.id, title, now, now),
    c.env.DB.prepare(
      `INSERT INTO puzzle_versions
        (id, project_id, parent_version_id, snapshot_json, seed, engine_version, validator_version, review_state, created_at, created_by)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      versionId,
      projectId,
      JSON.stringify(snap),
      snap.seed,
      snap.engineVersion ?? null,
      snap.validatorVersion ?? null,
      snap.reviewState,
      now,
      session.user.id,
    ),
    c.env.DB.prepare(
      `INSERT INTO share_links
        (token, project_id, version_id, owner_id, expires_at, revoked, allow_check, allow_reveal, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    ).bind(
      token,
      projectId,
      versionId,
      session.user.id,
      parsed.data.expiresAt ?? null,
      parsed.data.allowCheck ? 1 : 0,
      parsed.data.allowReveal ? 1 : 0,
      now,
    ),
  ]);

  const path = `/p/${token}/`;
  return c.json({
    token,
    path,
    url: new URL(path, c.env.PUBLIC_SITE_URL || "https://crosswordmaker.app").toString(),
    projectId,
    versionId,
    allowCheck: parsed.data.allowCheck,
    allowReveal: parsed.data.allowReveal,
    expiresAt: parsed.data.expiresAt ?? null,
  });
});

shareRoutes.post("/api/v1/shares/:token/revoke", async (c) => {
  if (!c.env.DB) {
    return c.json({ error: { code: "db_required", message: "D1 required." } }, 503);
  }
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { code: "unauthorized", message: "Sign in required." } }, 401);
  }
  const token = c.req.param("token");
  const row = await c.env.DB.prepare(
    `SELECT token, owner_id FROM share_links WHERE token = ?`,
  )
    .bind(token)
    .first<{ token: string; owner_id: string | null }>();
  if (!row || row.owner_id !== session.user.id) {
    return c.json({ error: { code: "not_found", message: "Share link not found." } }, 404);
  }
  await c.env.DB.prepare(`UPDATE share_links SET revoked = 1 WHERE token = ?`).bind(token).run();
  return c.json({ ok: true, token, revoked: true });
});

/** Project list/CRUD lives in routes/projects.ts */
