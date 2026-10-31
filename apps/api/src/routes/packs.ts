import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../env";
import { validateSession } from "../auth/session";
import { PuzzleSnapshotSchema } from "../play/snapshot";
import { resolvePackAccess } from "../packs/access";
import { buildExportManifest, buildLayoutVariants } from "../packs/variants";
import { processPackExportJob } from "../export/process-pack-export";

export const packRoutes = new Hono<{ Bindings: ApiEnv }>();

const CreatePackSchema = z.object({
  title: z.string().min(1).max(200),
  baseSeed: z.number().int().nonnegative().default(11),
  variantCount: z.number().int().min(1).max(8).optional(),
  /** Source entries — same clues across A/B/C layouts */
  entries: z
    .array(
      z.object({
        id: z.string().min(1),
        answerNormalized: z.string().regex(/^[A-Z]{3,24}$/),
        clue: z.string().max(280),
        displayAnswer: z.string().optional(),
      }),
    )
    .min(3)
    .max(40),
  reviewState: z.string().default("needs_review"),
});

packRoutes.get("/api/v1/packs", async (c) => {
  if (!c.env.DB) {
    return c.json({ error: { code: "db_required", message: "D1 required for packs." } }, 503);
  }
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { code: "unauthorized", message: "Sign in required." } }, 401);
  }
  const access = await resolvePackAccess(c.env, session.user.id);
  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.title, p.project_id, p.base_seed, p.max_variants, p.status, p.created_at, p.updated_at,
            (SELECT COUNT(*) FROM pack_items i WHERE i.pack_id = p.id) AS item_count
     FROM activity_packs p
     WHERE p.owner_id = ?
     ORDER BY p.updated_at DESC
     LIMIT 50`,
  )
    .bind(session.user.id)
    .all<{
      id: string;
      title: string;
      project_id: string;
      base_seed: number;
      max_variants: number;
      status: string;
      created_at: string;
      updated_at: string;
      item_count: number;
    }>();

  return c.json({
    packs: rows.results ?? [],
    access: {
      canCreatePack: access.canCreatePack,
      maxPacks: access.maxPacks,
      maxVariants: access.maxVariants,
      canBatchExport: access.canBatchExport,
      reason: access.reason,
    },
  });
});

packRoutes.get("/api/v1/packs/:id", async (c) => {
  if (!c.env.DB) {
    return c.json({ error: { code: "db_required", message: "D1 required." } }, 503);
  }
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { code: "unauthorized", message: "Sign in required." } }, 401);
  }
  const id = c.req.param("id");
  const pack = await c.env.DB.prepare(
    `SELECT id, title, project_id, base_seed, max_variants, status, created_at, updated_at
     FROM activity_packs WHERE id = ? AND owner_id = ?`,
  )
    .bind(id, session.user.id)
    .first<{
      id: string;
      title: string;
      project_id: string;
      base_seed: number;
      max_variants: number;
      status: string;
      created_at: string;
      updated_at: string;
    }>();
  if (!pack) {
    return c.json({ error: { code: "not_found", message: "Pack not found." } }, 404);
  }

  const items = await c.env.DB.prepare(
    `SELECT i.id, i.label, i.seed, i.version_id, i.sort_order, i.created_at,
            v.snapshot_json, v.review_state
     FROM pack_items i
     JOIN puzzle_versions v ON v.id = i.version_id
     WHERE i.pack_id = ?
     ORDER BY i.sort_order ASC`,
  )
    .bind(id)
    .all<{
      id: string;
      label: string;
      seed: number;
      version_id: string;
      sort_order: number;
      created_at: string;
      snapshot_json: string;
      review_state: string;
    }>();

  return c.json({
    pack,
    items: (items.results ?? []).map((row) => {
      const snap = PuzzleSnapshotSchema.parse(JSON.parse(row.snapshot_json));
      return {
        id: row.id,
        label: row.label,
        seed: row.seed,
        versionId: row.version_id,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        reviewState: row.review_state,
        title: snap.title,
        size: snap.size,
        placementCount: snap.placements.length,
      };
    }),
  });
});

packRoutes.post("/api/v1/packs", async (c) => {
  if (!c.env.DB) {
    return c.json({ error: { code: "db_required", message: "D1 required for packs." } }, 503);
  }
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { code: "unauthorized", message: "Sign in required." } }, 401);
  }

  const access = await resolvePackAccess(c.env, session.user.id);
  if (!access.canCreatePack) {
    return c.json(
      {
        error: {
          code: "entitlement_required",
          message: access.reason ?? "Activity Pack or Pro required.",
        },
      },
      403,
    );
  }

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM activity_packs WHERE owner_id = ? AND status = 'active'`,
  )
    .bind(session.user.id)
    .first<{ n: number }>();
  if ((countRow?.n ?? 0) >= access.maxPacks) {
    return c.json(
      {
        error: {
          code: "pack_limit",
          message: `Plan allows ${access.maxPacks} activity pack(s). Archive one or upgrade.`,
        },
      },
      403,
    );
  }

  const body = await c.req.json().catch(() => null);
  const parsed = CreatePackSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "invalid_request", message: "Invalid pack payload." } }, 400);
  }

  const variantCount = Math.min(
    parsed.data.variantCount ?? access.maxVariants,
    access.maxVariants,
  );
  const variants = buildLayoutVariants({
    title: parsed.data.title,
    entries: parsed.data.entries,
    baseSeed: parsed.data.baseSeed,
    count: variantCount,
    reviewState: parsed.data.reviewState,
  });

  const now = new Date().toISOString();
  const packId = crypto.randomUUID();
  const projectId = crypto.randomUUID();

  const statements = [
    c.env.DB.prepare(
      `INSERT INTO projects (id, owner_id, title, folder, archived, revision, created_at, updated_at)
       VALUES (?, ?, ?, 'packs', 0, 1, ?, ?)`,
    ).bind(projectId, session.user.id, parsed.data.title, now, now),
    c.env.DB.prepare(
      `INSERT INTO activity_packs
        (id, owner_id, project_id, title, base_seed, max_variants, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    ).bind(
      packId,
      session.user.id,
      projectId,
      parsed.data.title,
      parsed.data.baseSeed,
      access.maxVariants,
      now,
      now,
    ),
  ];

  const createdItems: Array<{
    label: string;
    seed: number;
    versionId: string;
    placedCount: number;
    validationOk: boolean;
  }> = [];

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i]!;
    const versionId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO puzzle_versions
          (id, project_id, parent_version_id, snapshot_json, seed, engine_version, validator_version, review_state, created_at, created_by)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        versionId,
        projectId,
        JSON.stringify(v.snapshot),
        v.seed,
        v.snapshot.engineVersion ?? null,
        v.snapshot.validatorVersion ?? null,
        v.snapshot.reviewState,
        now,
        session.user.id,
      ),
      c.env.DB.prepare(
        `INSERT INTO pack_items (id, pack_id, version_id, label, seed, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(itemId, packId, versionId, v.label, v.seed, i, now),
    );
    createdItems.push({
      label: v.label,
      seed: v.seed,
      versionId,
      placedCount: v.placedCount,
      validationOk: v.validationOk,
    });
  }

  await c.env.DB.batch(statements);

  return c.json({
    packId,
    projectId,
    title: parsed.data.title,
    path: `/app/packs/${packId}/`,
    variants: createdItems,
  });
});

packRoutes.post("/api/v1/packs/:id/export", async (c) => {
  if (!c.env.DB) {
    return c.json({ error: { code: "db_required", message: "D1 required." } }, 503);
  }
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { code: "unauthorized", message: "Sign in required." } }, 401);
  }
  const access = await resolvePackAccess(c.env, session.user.id);
  if (!access.canBatchExport) {
    return c.json(
      {
        error: {
          code: "entitlement_required",
          message: "Batch export requires Activity Pack or Pro.",
        },
      },
      403,
    );
  }

  const id = c.req.param("id");
  const pack = await c.env.DB.prepare(
    `SELECT id, title FROM activity_packs WHERE id = ? AND owner_id = ?`,
  )
    .bind(id, session.user.id)
    .first<{ id: string; title: string }>();
  if (!pack) {
    return c.json({ error: { code: "not_found", message: "Pack not found." } }, 404);
  }

  const items = await c.env.DB.prepare(
    `SELECT i.label, i.seed, i.version_id, v.snapshot_json
     FROM pack_items i
     JOIN puzzle_versions v ON v.id = i.version_id
     WHERE i.pack_id = ?
     ORDER BY i.sort_order ASC`,
  )
    .bind(id)
    .all<{ label: string; seed: number; version_id: string; snapshot_json: string }>();

  const parsedItems = (items.results ?? []).map((row) => ({
    label: row.label,
    seed: row.seed,
    versionId: row.version_id,
    snapshot: PuzzleSnapshotSchema.parse(JSON.parse(row.snapshot_json)),
  }));

  const previewManifest = buildExportManifest({
    packId: pack.id,
    title: pack.title,
    items: parsedItems,
  });

  const now = new Date().toISOString();
  const jobId = crypto.randomUUID();
  const wantSync = c.req.query("sync") === "1" || !c.env.JOBS;

  await c.env.DB.prepare(
    `INSERT INTO jobs (id, owner_id, project_id, type, status, stage, payload_ref, error_code, created_at, updated_at)
     VALUES (?, ?, NULL, 'pack_export', 'queued', 'queued', ?, NULL, ?, ?)`,
  )
    .bind(jobId, session.user.id, pack.id, now, now)
    .run();

  if (c.env.JOBS && !wantSync) {
    try {
      await c.env.JOBS.send({ jobId, type: "pack_export" });
      return c.json({
        jobId,
        status: "queued",
        pollPath: `/api/v1/jobs/${jobId}`,
        downloadPath: `/api/v1/jobs/${jobId}/download`,
        previewManifest,
        note: "ZIP export queued; poll job status then download when completed.",
      });
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "pack_export_enqueue_failed",
          jobId,
          name: err instanceof Error ? err.name : "error",
        }),
      );
      // Fall through to inline processing when queue send fails.
    }
  }

  if (!c.env.FILES) {
    // Dev fallback: return JSON manifest only (no R2).
    const manifestId = crypto.randomUUID();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO export_manifests (id, owner_id, pack_id, job_id, manifest_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(manifestId, session.user.id, pack.id, jobId, JSON.stringify(previewManifest), now),
      c.env.DB.prepare(
        `UPDATE jobs SET status = 'completed', stage = 'manifest_only', payload_ref = ?, updated_at = ? WHERE id = ?`,
      ).bind(manifestId, now, jobId),
    ]);
    return c.json({
      jobId,
      manifestId,
      status: "completed",
      mode: "manifest_only",
      note: "FILES R2 binding missing — returned JSON manifest only. Bind FILES for ZIP.",
      manifest: previewManifest,
    });
  }

  const result = await processPackExportJob(
    { DB: c.env.DB, FILES: c.env.FILES },
    jobId,
  );
  if (!result.ok) {
    return c.json(
      {
        error: { code: result.errorCode, message: result.message },
        jobId: result.jobId,
        previewManifest,
      },
      500,
    );
  }

  return c.json({
    jobId: result.jobId,
    manifestId: result.manifestId,
    status: "completed",
    mode: "inline_zip",
    downloadPath: `/api/v1/jobs/${result.jobId}/download`,
    byteSize: result.byteSize,
    sha256: result.sha256,
    previewManifest,
  });
});
