/**
 * Persistent dedup so the same fund announcement doesn't reappear in every run.
 *
 * Uses Upstash Redis if configured — add "Redis" from the Vercel Marketplace
 * (Storage tab) to your project, which sets UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN automatically. Without it, dedup falls back to
 * "within this run only" — the run still works, it just won't remember what
 * it already sent.
 */

let client = null;
let checked = false;

async function getClient() {
  if (checked) return client;
  checked = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = await import('@upstash/redis');
    client = new Redis({ url, token });
  } catch {
    client = null; // package unavailable — skip persistence, don't crash the run
  }
  return client;
}

const PREFIX = 'impactpulse:seen:';
const TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days is plenty for a weekly digest

/** Returns the subset of links NOT already recorded as seen. Does not mark them seen. */
export async function filterUnseen(links) {
  const redis = await getClient();
  if (!redis) return { unseen: links, persistent: false };
  try {
    const results = await Promise.all(links.map((l) => redis.get(PREFIX + l)));
    return { unseen: links.filter((_, i) => !results[i]), persistent: true };
  } catch {
    return { unseen: links, persistent: false };
  }
}

/** Marks links as seen so future runs skip them. */
export async function markSeen(links) {
  const redis = await getClient();
  if (!redis || !links.length) return;
  try {
    await Promise.all(links.map((l) => redis.set(PREFIX + l, 1, { ex: TTL_SECONDS })));
  } catch {
    // best-effort — a failed write just means slightly more repeats next run
  }
}
