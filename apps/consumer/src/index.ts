/**
 * Queue consumer stub — idempotent job processing lands with Phase 05/07.
 * Messages must carry IDs only; payload snapshots live in D1.
 */
export interface Env {
  DB?: D1Database;
}

export default {
  async fetch(): Promise<Response> {
    return new Response("acm-consumer: queue worker (stub)", { status: 200 });
  },
  async queue(batch: MessageBatch<{ jobId: string }>, _env: Env): Promise<void> {
    for (const msg of batch.messages) {
      // Idempotency: look up jobId, skip if completed. Not wired yet.
      console.log("received job", msg.body.jobId);
      msg.ack();
    }
  },
};
