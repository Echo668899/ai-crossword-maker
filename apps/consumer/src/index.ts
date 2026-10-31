/**
 * Queue consumer — pack ZIP → private R2, future async AI jobs.
 * Messages carry IDs only; snapshots live in D1.
 */
import { processPackExportJob } from "@acm/print-layout";

export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
}

type JobMessage = { jobId: string; type?: string };

export default {
  async fetch(): Promise<Response> {
    return new Response("acm-consumer: pack ZIP + job worker", { status: 200 });
  },
  async queue(batch: MessageBatch<JobMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const jobId = msg.body?.jobId;
      if (!jobId) {
        msg.ack();
        continue;
      }
      try {
        const result = await processPackExportJob(env, jobId);
        if (result.ok) {
          msg.ack();
          continue;
        }
        if (
          result.errorCode === "not_found" ||
          result.errorCode === "invalid_payload" ||
          result.errorCode === "pack_not_found" ||
          result.errorCode === "empty_pack" ||
          result.errorCode === "r2_required"
        ) {
          msg.ack();
          continue;
        }
        msg.retry();
      } catch (err) {
        console.error(
          JSON.stringify({
            event: "consumer_job_error",
            jobId,
            name: err instanceof Error ? err.name : "error",
          }),
        );
        msg.retry();
      }
    }
  },
};
