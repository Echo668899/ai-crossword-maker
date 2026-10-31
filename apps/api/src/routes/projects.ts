import { Hono } from "hono";
import { z } from "zod";
import { pricing } from "@acm/config/pricing";
import type { ApiEnv } from "../env";
import { validateSession } from "../auth/session";
import { PuzzleSnapshotSchema } from "../play/snapshot";

export const projectRoutes = new Hono<{ Bindings: ApiEnv }>();

const CreateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  folder: z.string().max(80).optional().nullable(),
  snapshot: PuzzleSnapshotSchema,
});

const PatchProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  folder: z.string().max(80).optional().nullable(),
  archived: z.boolean().optional(),
  /** Optimistic concurrency — reject with 409 when stale. */
  expectedRevision: z.number().int().positive(),
  /** Optional new head snapshot (creates a version and bumps revision). */
  snapshot: PuzzleSnapshotSchema.optional(),
});

projectRoutes.get("/api/v1/projects", async (c) => {
  if (!c.env.DB) {
    return c.json({ error: { code: "db_required", message: "D1 required." } }, 503);
  }
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { code: "unauthorized", message: "Sign in required." } }, 401);
  }
  const includeArchived = c.req.query("archived") === "1";
  const rows = await c.env.DB.prepare(
    includeArchived
      ? `SELECT id, title, folder, archived, revision, created_at, updated_at FROM projects
         WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 100`
      : `SELECT id, title, folder, archived, revision, created_at, updated_at FROM projects
         WHERE owner_id = ? AND archived = 0 ORDER BY updated_at DESC LIMIT 50`,
  )
    .bind(session.user.id)
    .all<{
      id: string;
      title: string;
      folder: string | null;
      archived: number;
      revision: number;
      created_at: string;
      updated_at: string;
    }>();

  return c.json({
    projects: (rows.results ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      folder: p.folder,
      archived: Boolean(p.archived),
      revision: p.revision,
      created_at: p.created_at,
      updated_at: p.updated_at,
      path: `/app/puzzles/${p.id}/edit/`,
    })),
  });
});

projectRoutes.post("/api/v1/projects", async (c) => {
  if (!c.env.DB) {
    return c.json({ error: { code: "db_required", message: "D1 required." } }, 503);
  }
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { code: "unauthorized", message: "Sign in required." } }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "invalid_request", message: "Invalid project payload." } }, 400);
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
          message: `Free plan allows ${maxProjects} cloud projects. Archive one or upgrade.`,
        },
      },
      403,
    );
  }

  const now = new Date().toISOString();
  const projectId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const snap = parsed.data.snapshot;
  const title = parsed.data.title || snap.title;

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO projects (id, owner_id, title, folder, archived, revision, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 1, ?, ?)`,
    ).bind(projectId, session.user.id, title, parsed.data.folder ?? null, now, now),
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
  ]);

  return c.json({
    id: projectId,
    versionId,
    title,
    revision: 1,
    path: `/app/puzzles/${projectId}/edit/`,
  });
});

projectRoutes.get("/api/v1/projects/:id", async (c) => {
  if (!c.env.DB) {
    return c.json({ error: { code: "db_required", message: "D1 required." } }, 503);
  }
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { code: "unauthorized", message: "Sign in required." } }, 401);
  }
  const id = c.req.param("id");
  const project = await c.env.DB.prepare(
    `SELECT id, title, folder, archived, revision, created_at, updated_at
     FROM projects WHERE id = ? AND owner_id = ?`,
  )
    .bind(id, session.user.id)
    .first<{
      id: string;
      title: string;
      folder: string | null;
      archived: number;
      revision: number;
      created_at: string;
      updated_at: string;
    }>();
  if (!project) {
    return c.json({ error: { code: "not_found", message: "Project not found." } }, 404);
  }

  const head = await c.env.DB.prepare(
    `SELECT id, snapshot_json, review_state, created_at
     FROM puzzle_versions WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(id)
    .first<{ id: string; snapshot_json: string; review_state: string; created_at: string }>();

  return c.json({
    id: project.id,
    title: project.title,
    folder: project.folder,
    archived: Boolean(project.archived),
    revision: project.revision,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    headVersion: head
      ? {
          id: head.id,
          reviewState: head.review_state,
          createdAt: head.created_at,
          snapshot: PuzzleSnapshotSchema.parse(JSON.parse(head.snapshot_json)),
        }
      : null,
  });
});

projectRoutes.patch("/api/v1/projects/:id", async (c) => {
  if (!c.env.DB) {
    return c.json({ error: { code: "db_required", message: "D1 required." } }, 503);
  }
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { code: "unauthorized", message: "Sign in required." } }, 401);
  }
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = PatchProjectSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "invalid_request", message: "Invalid patch payload." } }, 400);
  }

  const project = await c.env.DB.prepare(
    `SELECT id, title, folder, archived, revision FROM projects WHERE id = ? AND owner_id = ?`,
  )
    .bind(id, session.user.id)
    .first<{
      id: string;
      title: string;
      folder: string | null;
      archived: number;
      revision: number;
    }>();
  if (!project) {
    return c.json({ error: { code: "not_found", message: "Project not found." } }, 404);
  }

  if (project.revision !== parsed.data.expectedRevision) {
    return c.json(
      {
        error: {
          code: "revision_conflict",
          message: "Project was updated elsewhere. Reload and retry.",
        },
        currentRevision: project.revision,
      },
      409,
    );
  }

  const now = new Date().toISOString();
  const nextTitle = parsed.data.title ?? project.title;
  const nextFolder =
    parsed.data.folder !== undefined ? parsed.data.folder : project.folder;
  const nextArchived =
    parsed.data.archived !== undefined ? (parsed.data.archived ? 1 : 0) : project.archived;
  const statements = [
    c.env.DB.prepare(
      `UPDATE projects SET title = ?, folder = ?, archived = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND revision = ?`,
    ).bind(nextTitle, nextFolder, nextArchived, now, id, project.revision),
  ];

  let versionId: string | undefined;
  if (parsed.data.snapshot) {
    versionId = crypto.randomUUID();
    const snap = parsed.data.snapshot;
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO puzzle_versions
          (id, project_id, parent_version_id, snapshot_json, seed, engine_version, validator_version, review_state, created_at, created_by)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        versionId,
        id,
        JSON.stringify(snap),
        snap.seed,
        snap.engineVersion ?? null,
        snap.validatorVersion ?? null,
        snap.reviewState,
        now,
        session.user.id,
      ),
    );
  }

  const batch = await c.env.DB.batch(statements);
  const updated = batch[0]?.meta.changes ?? 0;
  if (updated === 0) {
    const fresh = await c.env.DB.prepare(`SELECT revision FROM projects WHERE id = ?`)
      .bind(id)
      .first<{ revision: number }>();
    return c.json(
      {
        error: {
          code: "revision_conflict",
          message: "Project was updated elsewhere. Reload and retry.",
        },
        currentRevision: fresh?.revision ?? project.revision,
      },
      409,
    );
  }

  return c.json({
    id,
    title: nextTitle,
    folder: nextFolder,
    archived: Boolean(nextArchived),
    revision: project.revision + 1,
    versionId: versionId ?? null,
    updatedAt: now,
  });
});
