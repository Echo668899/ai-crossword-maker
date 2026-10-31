/** Stable anon fingerprint from IP + UA. Never logs raw IP/UA. */
export async function anonFingerprint(request: Request): Promise<string> {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const ua = request.headers.get("user-agent") || "unknown";
  const material = `${ip}|${ua}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
