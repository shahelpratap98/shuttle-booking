// Fixed-window counter held in this server instance's memory. No imports, so
// it is safe to use from proxy.ts as well as from server code.
//
// On Vercel each warm instance has its own counters, so this is a fast first
// line of defence against floods and password guessing, not an exact quota.
// Supabase Auth applies its own sign-in limits on top.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 20_000;
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 30_000 && buckets.size < MAX_KEYS) return;
  lastSweep = now;
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
  if (buckets.size >= MAX_KEYS) {
    let i = 0;
    for (const key of buckets.keys()) {
      if (i++ > MAX_KEYS / 2) break;
      buckets.delete(key);
    }
  }
}

export type LimitResult = { ok: boolean; retryAfter: number };

export function hit(key: string, limit: number, windowSeconds: number): LimitResult {
  const now = Date.now();
  sweep(now);
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowSeconds * 1000 };
    buckets.set(key, b);
  }
  b.count++;
  return { ok: b.count <= limit, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
}

// Vercel sets x-forwarded-for itself (clients cannot spoof the first hop).
export function ipFrom(headers: Headers): string {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export function waitMessage(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1 ? "Wait a minute and try again." : `Wait about ${minutes} minutes and try again.`;
}
