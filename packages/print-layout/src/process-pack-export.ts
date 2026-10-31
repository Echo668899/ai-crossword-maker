import { buildPackExportZip, type PackZipManifest } from "./pack-zip.js";
import type { PackSnapshot } from "./from-snapshot.js";

export type PackExportEnv = {
  DB: D1Database;
  FILES?: R2Bucket;
};

export type PackExportResult =
  | {
      ok: true;
      jobId: string;
      fileId: string;
      r2Key: string;
      byteSize: number;
      sha256: string;
      manifestId: string;
      manifest: PackZipManifest;
    }
  | { ok: false; jobId: string; errorCode: string; message: string };

function parseSnapshot(json: string): PackSnapshot {
  const raw = JSON.parse(json) as PackSnapshot;
  if (
    !raw ||
    typeof raw.title !== "string" ||
    !raw.size?.rows ||
    !Array.isArray(raw.grid) ||
    !Array.isArray(raw.placements) ||
    !Array.isArray(raw.entries)
  ) {
    throw new Error("invalid_snapshot");
  }
  return raw;
}

/**
 * Materialize a pack_export job into a private R2 ZIP.
 * Idempotent when an export_files row already exists for a completed job.
 */
export async function processPackExportJob(
  env: PackExportEnv,
  jobId: string,
): Promise<PackExportResult> {
  if (!env.FILES) {
    return {
      ok: false,
      jobId,
      errorCode: "r2_required",
      message: "FILES R2 binding required for ZIP export.",
    };
  }

  const job = await env.DB.prepare(
    `SELECT id, owner_id, type, status, payload_ref FROM jobs WHERE id = ?`,
  )
    .bind(jobId)
    .first<{
      id: string;
      owner_id: string | null;
      type: string;
      status: string;
      payload_ref: string | null;
    }>();

  if (!job || job.type !== "pack_export") {
    return { ok: false, jobId, errorCode: "not_found", message: "Export job not found." };
  }

  const existing = await env.DB.prepare(
    `SELECT id, r2_key, byte_size, sha256 FROM export_files WHERE job_id = ? LIMIT 1`,
  )
    .bind(jobId)
    .first<{ id: string; r2_key: string; byte_size: number; sha256: string | null }>();

  if (job.status === "completed" && existing) {
    return {
      ok: true,
      jobId,
      fileId: existing.id,
      r2Key: existing.r2_key,
      byteSize: existing.byte_size,
      sha256: existing.sha256 ?? "",
      manifestId: job.payload_ref ?? "",
      manifest: {
        formatVersion: 1,
        packId: "",
        title: "",
        generatedAt: "",
        folders: { students: "students/", answerKeys: "answer-keys/", instructions: "instructions/" },
        files: [],
        instructions: { path: "instructions/readme.txt", text: "" },
      },
    };
  }

  const packId = job.payload_ref;
  if (!packId || !job.owner_id) {
    await markFailed(env, jobId, "invalid_payload");
    return {
      ok: false,
      jobId,
      errorCode: "invalid_payload",
      message: "Job missing pack id or owner.",
    };
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE jobs SET status = 'running', stage = 'zip', updated_at = ? WHERE id = ?`,
  )
    .bind(now, jobId)
    .run();

  try {
    const pack = await env.DB.prepare(
      `SELECT id, title FROM activity_packs WHERE id = ? AND owner_id = ?`,
    )
      .bind(packId, job.owner_id)
      .first<{ id: string; title: string }>();
    if (!pack) {
      await markFailed(env, jobId, "pack_not_found");
      return { ok: false, jobId, errorCode: "pack_not_found", message: "Pack not found." };
    }

    const items = await env.DB.prepare(
      `SELECT i.label, i.seed, i.version_id, v.snapshot_json
       FROM pack_items i
       JOIN puzzle_versions v ON v.id = i.version_id
       WHERE i.pack_id = ?
       ORDER BY i.sort_order ASC`,
    )
      .bind(packId)
      .all<{ label: string; seed: number; version_id: string; snapshot_json: string }>();

    const parsedItems = (items.results ?? []).map((row) => ({
      label: row.label,
      seed: row.seed,
      versionId: row.version_id,
      snapshot: parseSnapshot(row.snapshot_json),
    }));

    if (!parsedItems.length) {
      await markFailed(env, jobId, "empty_pack");
      return { ok: false, jobId, errorCode: "empty_pack", message: "Pack has no variants." };
    }

    const { bytes, manifest, sha256Hex } = await buildPackExportZip({
      packId: pack.id,
      title: pack.title,
      items: parsedItems,
    });

    const fileId = crypto.randomUUID();
    const manifestId = crypto.randomUUID();
    const r2Key = `exports/${job.owner_id}/${pack.id}/${jobId}.zip`;
    await env.FILES.put(r2Key, bytes, {
      httpMetadata: { contentType: "application/zip" },
      customMetadata: {
        ownerId: job.owner_id,
        packId: pack.id,
        jobId,
        sha256: sha256Hex,
      },
    });

    const doneAt = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO export_manifests (id, owner_id, pack_id, job_id, manifest_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(manifestId, job.owner_id, pack.id, jobId, JSON.stringify(manifest), doneAt),
      env.DB.prepare(
        `INSERT INTO export_files (id, job_id, owner_id, pack_id, r2_key, content_type, byte_size, sha256, created_at)
         VALUES (?, ?, ?, ?, ?, 'application/zip', ?, ?, ?)`,
      ).bind(fileId, jobId, job.owner_id, pack.id, r2Key, bytes.byteLength, sha256Hex, doneAt),
      env.DB.prepare(
        `UPDATE jobs SET status = 'completed', stage = 'ready', payload_ref = ?, error_code = NULL, updated_at = ?
         WHERE id = ?`,
      ).bind(manifestId, doneAt, jobId),
    ]);

    return {
      ok: true,
      jobId,
      fileId,
      r2Key,
      byteSize: bytes.byteLength,
      sha256: sha256Hex,
      manifestId,
      manifest,
    };
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "pack_export_failed",
        jobId,
        name: err instanceof Error ? err.name : "error",
      }),
    );
    await markFailed(env, jobId, "zip_failed");
    return {
      ok: false,
      jobId,
      errorCode: "zip_failed",
      message: "Failed to build or store export ZIP.",
    };
  }
}

async function markFailed(env: PackExportEnv, jobId: string, code: string) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE jobs SET status = 'failed', stage = 'error', error_code = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(code, now, jobId)
    .run();
}
