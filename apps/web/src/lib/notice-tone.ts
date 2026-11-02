import type { NoticeTone } from "@acm/ui";

export type { NoticeTone };

/**
 * Classify Maker / pricing / export copy so entitlement tips are not muted gray.
 * Warn (quota exhausted) wins over upsell ("upgrade") when both appear.
 */
const WARN =
  /used up|quota exhausted|limit reached|you(?:['’]ve| have) used today's free/i;

const UPSELL =
  /upgrade|requires an activity pack|activity pack(?:s)? require|activity pack or pro|pro required|see pricing|archive one or upgrade|batch export requires|include(?:s)? a (?:light |site |crosswordmaker\.app )?footer|free pdfs include|pro removes/i;

const INFO =
  /(?:^|\b)pro:|pro ·|free plan can still|no entitlement ledger|welcome to pro|checkout is offline|no site footer|activity packs and batch export are included|activity pack unlocks|generate clues is unlimited/i;

export function noticeToneFromCopy(message: string): NoticeTone | null {
  const text = message.trim();
  if (!text) return null;
  if (WARN.test(text)) return "warn";
  if (UPSELL.test(text)) return "upsell";
  if (INFO.test(text)) return "info";
  return null;
}
