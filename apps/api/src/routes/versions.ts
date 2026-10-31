import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../env";
import { validateSession } from "../auth/session";
import { PuzzleSnapshotSchema } from "../play/snapshot";
import { resolveVersionHistoryLimit } from "../packs/access";

export const versionRoutes = new Hono<{ Bindings: ApiEnv }>();

const SaveVersionSchema = z.object({
  snapshot: PuzzleSnapshotSchema,
  parentVersionId: z.string().uuid().optional().nullable(),
});

async function ownedProject(env: ApiEnv, projectId: string, userId: string) {
  return env.DB!.prepare(
    `SELECT id, title, revision FROM projects WHERE id = ? AND owner_id = ? AND archived = 0`,
  )
    .bind(projectId, userId)
    .first<{ id: string; title: string; revision: number }>();
}

versionRoutes.get("/api/v1/projects/:id/versions", async (c) => {
  if (!c.env.DB) {
    return c.json({ error: { code: "db_required", message: "D1 required." } }, 503);
  }
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { code: "unauthorized", message: "Sign in required." } }, 401);
  }
  const projectId = c.req.param("id");
  const project = await ownedProject(c.env, projectId, session.user.id);
  if (!project) {
    return c.json({ error: { code: "not_found", message: "Project not found." } }, 404);
  }

  const { maxVersions } = await resolveVersionHistoryLimit(c.env, session.user.id);
  const rows = await c.env.DB.prepare(
    `SELECT id, parent_version_id, seed, engine_version, validator_version, review_state, created_at, created_by
     FROM puzzle_versions
     WHERE project_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
  )
    .bind(projectId, maxVersions)
    .all<{
      id: string;
      parent_version_id: string | null;
      seed: number | null;
      engine_version: string | null;
      validator_version: string | null;
      review_state: string;
      created_at: string;
      created_by: string | null;
    }>();

  return c.json({
    projectId,
    title: project.title,
    revision: project.revision,
    maxVersions,
    versions: rows.results ?? [],
  });
});

versionRoutes.post("/api/v1/projects/:id/versions", async (c) => {
  if (!c.env.DB) {
    return c.json({ error: { code: "db_required", message: "D1 required." } }, 503);
  }
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { code: "unauthorized", message: "Sign in required." } }, 401);
  }
  const projectId = c.req.param("id");
  const project = await ownedProject(c.env, projectId, session.user.id);
  if (!project) {
    return c.json({ error: { code: "not_found", message: "Project not found." } }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = SaveVersionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "invalid_request", message: "Invalid version payload." } }, 400);
  }

  const { maxVersions } = await resolveVersionHistoryLimit(c.env, session.user.id);
  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM puzzle_versions WHERE project_id = ?`,
  )
    .bind(projectId)
    .first<{ n: number }>();
  if ((countRow?.n ?? 0) >= maxVersions) {
    return c.json(
      {
        error: {
          code: "version_limit",
          message: `Version history limit (${maxVersions}) reached for this plan.`,
        },
      },
      403,
    );
  }

  if (parsed.data.parentVersionId) {
    const parent = await c.env.DB.prepare(
      `SELECT id FROM puzzle_versions WHERE id = ? AND project_id = ?`,
    )
      .bind(parsed.data.parentVersionId, projectId)
      .first<{ id: string }>();
    if (!parent) {
      return c.json(
        { error: { code: "invalid_parent", message: "parentVersionId not on this project." } },
        400,
      );
    }
  }

  const now = new Date().toISOString();
  const versionId = crypto.randomUUID();
  const snap = parsed.data.snapshot;

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO puzzle_versions
        (id, project_id, parent_version_id, snapshot_json, seed, engine_version, validator_version, review_state, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      versionId,
      projectId,
      parsed.data.parentVersionId ?? null,
      JSON.stringify(snap),
      snap.seed,
      snap.engineVersion ?? null,
      snap.validatorVersion ?? null,
      snap.reviewState,
      now,
      session.user.id,
    ),
    c.env.DB.prepare(
      `UPDATE projects SET revision = revision + 1, title = ?, updated_at = ? WHERE id = ?`,
    ).bind(snap.title, now, projectId),
  ]);

  return c.json({
    versionId,
    projectId,
    seed: snap.seed,
    reviewState: snap.reviewState,
    createdAt: now,
  });
});

versionRoutes.get("/api/v1/projects/:id/versions/:versionId", async (c) => {
  if (!c.env.DB) {
    return c.json({ error: { code: "db_required", message: "D1 required." } }, 503);
  }
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { code: "unauthorized", message: "Sign in required." } }, 401);
  }
  const projectId = c.req.param("id");
  const versionId = c.req.param("versionId");
  const project = await ownedProject(c.env, projectId, session.user.id);
  if (!project) {
    return c.json({ error: { code: "not_found", message: "Project not found." } }, 404);
  }
  const row = await c.env.DB.prepare(
    `SELECT id, parent_version_id, snapshot_json, seed, engine_version, validator_version, review_state, created_at
     FROM puzzle_versions WHERE id = ? AND project_id = ?`,
  )
    .bind(versionId, projectId)
    .first<{
      id: string;
      parent_version_id: string | null;
      snapshot_json: string;
      seed: number | null;
      engine_version: string | null;
      validator_version: string | null;
      review_state: string;
      created_at: string;
    }>();
  if (!row) {
    return c.json({ error: { code: "not_found", message: "Version not found." } }, 404);
  }
  const snapshot = PuzzleSnapshotSchema.parse(JSON.parse(row.snapshot_json));
  return c.json({
    id: row.id,
    parentVersionId: row.parent_version_id,
    seed: row.seed,
    engineVersion: row.engine_version,
    validatorVersion: row.validator_version,
    reviewState: row.review_state,
    createdAt: row.created_at,
    snapshot,
  });
});
