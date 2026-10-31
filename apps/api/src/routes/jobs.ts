import { Hono } from "hono";
import type { ApiEnv } from "../env";
import { validateSession } from "../auth/session";
import { processPackExportJob } from "../export/process-pack-export";

export const jobRoutes = new Hono<{ Bindings: ApiEnv }>();

jobRoutes.get("/api/v1/jobs/:id", async (c) => {
  if (!c.env.DB) {
    return c.json({ error: { code: "db_required", message: "D1 required." } }, 503);
  }
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { code: "unauthorized", message: "Sign in required." } }, 401);
  }
  const id = c.req.param("id");
  const job = await c.env.DB.prepare(
    `SELECT id, owner_id, project_id, type, status, stage, payload_ref, error_code, created_at, updated_at
     FROM jobs WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      owner_id: string | null;
      project_id: string | null;
      type: string;
      status: string;
      stage: string | null;
      payload_ref: string | null;
      error_code: string | null;
      created_at: string;
      updated_at: string;
    }>();

  if (!job || job.owner_id !== session.user.id) {
    return c.json({ error: { code: "not_found", message: "Job not found." } }, 404);
  }

  const file = await c.env.DB.prepare(
    `SELECT id, r2_key, content_type, byte_size, sha256, created_at FROM export_files WHERE job_id = ? LIMIT 1`,
  )
    .bind(id)
    .first<{
      id: string;
      r2_key: string;
      content_type: string;
      byte_size: number;
      sha256: string | null;
      created_at: string;
    }>();

  return c.json({
    id: job.id,
    type: job.type,
    status: job.status,
    stage: job.stage,
    errorCode: job.error_code,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    downloadPath: file ? `/api/v1/jobs/${job.id}/download` : null,
    file: file
      ? {
          id: file.id,
          contentType: file.content_type,
          byteSize: file.byte_size,
          sha256: file.sha256,
          createdAt: file.created_at,
        }
      : null,
  });
});

jobRoutes.get("/api/v1/jobs/:id/download", async (c) => {
  if (!c.env.DB) {
    return c.json({ error: { code: "db_required", message: "D1 required." } }, 503);
  }
  if (!c.env.FILES) {
    return c.json({ error: { code: "r2_required", message: "FILES binding required." } }, 503);
  }
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { code: "unauthorized", message: "Sign in required." } }, 401);
  }
  const id = c.req.param("id");
  const job = await c.env.DB.prepare(
    `SELECT id, owner_id, status FROM jobs WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: string; owner_id: string | null; status: string }>();
  if (!job || job.owner_id !== session.user.id) {
    return c.json({ error: { code: "not_found", message: "Job not found." } }, 404);
  }
  if (job.status !== "completed") {
    return c.json(
      { error: { code: "not_ready", message: `Export status is ${job.status}.` } },
      409,
    );
  }

  const file = await c.env.DB.prepare(
    `SELECT r2_key, content_type, byte_size FROM export_files WHERE job_id = ? LIMIT 1`,
  )
    .bind(id)
    .first<{ r2_key: string; content_type: string; byte_size: number }>();
  if (!file) {
    return c.json({ error: { code: "missing_file", message: "Export file missing." } }, 404);
  }

  const obj = await c.env.FILES.get(file.r2_key);
  if (!obj) {
    return c.json({ error: { code: "missing_object", message: "R2 object missing." } }, 404);
  }

  const headers = new Headers();
  headers.set("content-type", file.content_type || "application/zip");
  headers.set("content-disposition", `attachment; filename="pack-export-${id.slice(0, 8)}.zip"`);
  headers.set("cache-control", "private, no-store");
  if (file.byte_size) headers.set("content-length", String(file.byte_size));

  return new Response(obj.body, { status: 200, headers });
});

/** Dev/ops helper: re-run a queued/failed pack export inline when consumer is offline. */
jobRoutes.post("/api/v1/jobs/:id/process", async (c) => {
  if (!c.env.DB) {
    return c.json({ error: { code: "db_required", message: "D1 required." } }, 503);
  }
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: { code: "unauthorized", message: "Sign in required." } }, 401);
  }
  const id = c.req.param("id");
  const job = await c.env.DB.prepare(`SELECT id, owner_id, type FROM jobs WHERE id = ?`)
    .bind(id)
    .first<{ id: string; owner_id: string | null; type: string }>();
  if (!job || job.owner_id !== session.user.id || job.type !== "pack_export") {
    return c.json({ error: { code: "not_found", message: "Job not found." } }, 404);
  }
  const result = await processPackExportJob(
    { DB: c.env.DB, FILES: c.env.FILES },
    id,
  );
  if (!result.ok) {
    return c.json(
      { error: { code: result.errorCode, message: result.message }, jobId: result.jobId },
      result.errorCode === "r2_required" ? 503 : 500,
    );
  }
  return c.json({
    jobId: result.jobId,
    status: "completed",
    downloadPath: `/api/v1/jobs/${result.jobId}/download`,
    byteSize: result.byteSize,
    sha256: result.sha256,
  });
});
