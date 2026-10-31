import type { ApiEnv } from "../env";

/** Append an audit row. Never store raw word lists, clues, or secrets in meta. */
export async function writeAuditLog(
  env: ApiEnv,
  input: {
    actorUserId?: string | null;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    meta?: Record<string, unknown> | null;
  },
): Promise<void> {
  if (!env.DB) return;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const metaJson = input.meta ? JSON.stringify(input.meta) : null;
  await env.DB.prepare(
    `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.actorUserId ?? null,
      input.action,
      input.targetType ?? null,
      input.targetId ?? null,
      metaJson,
      now,
    )
    .run();
}
