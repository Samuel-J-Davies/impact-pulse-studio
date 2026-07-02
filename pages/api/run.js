import { fetchFeed, googleNewsUrl, managerQuery, rotatingBatch, pool, normLink } from '../../lib/feeds';
import { filterUnseen, markSeen } from '../../lib/dedup';
import { fetchPreview } from '../../lib/preview';
import managersList from '../../config/managers.json';

export const config = { maxDuration: 60 }; // Vercel Hobby cap; Pro allows more headroom

// Default filter model. Override with FILTER_MODEL env var. Verify the exact
// string against your Anthropic console — model names change over time.
const FILTER_MODEL = process.env.FILTER_MODEL || 'claude-sonnet-5';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set. Add it in Vercel → Settings → Environment Variables, then redeploy.' });
  }

  const {
    keywords = [],
    sources = [],
    days = 8,
    maxItems = 200,
    criteriaBlock = '',
    rememberSeen = true,
    searchManagers = true,
    managerBatch = 25,
    richPreviews = true,
  } = req.body || {};

  const minDate = new Date();
  minDate.setDate(minDate.getDate() - Number(days));

  // ---- 1. Build feed jobs (each carries a source tier: 1 best … 3 weakest) ----
  const jobs = [];
  keywords.filter(Boolean).forEach((kw) => jobs.push({ label: `keyword: ${kw}`, url: googleNewsUrl(`"${kw}"`, days), tier: 3 }));
  sources.filter((s) => s.active && s.url).forEach((s) => jobs.push({ label: `source: ${s.name}`, url: s.url, tier: Number(s.tier) || 2, sourceName: s.name }));

  let managerInfo = null;
  if (searchManagers && managersList.length) {
    const { batch, from, to, total, batches } = rotatingBatch(managersList, Number(managerBatch));
    managerInfo = { from, to, total, batches };
    batch.forEach((m) => jobs.push({ label: `manager: ${m}`, url: managerQuery(m, days), tier: 3 }));
  }

  if (!jobs.length) return res.status(400).json({ error: 'Nothing to search. Add a keyword or source, or enable manager search.' });

  // ---- 2. Fetch all feeds with bounded concurrency ----
  const fetched = await pool(jobs, async (job) => ({ job, ...(await fetchFeed(job.url)) }), 8);
  const feedErrors = fetched.filter((r) => r.error).map((r) => ({ source: r.job.label, error: r.error }));

  // ---- 3. Dedup by normalized link, keep the best-tier copy of exact-URL dupes ----
  const byKey = new Map();
  fetched.forEach((r) => {
    r.items.forEach((it) => {
      if (!it.title || !it.link || it.pubDate < minDate) return;
      const key = normLink(it.link);
      const cand = {
        title: it.title, link: it.link, image: it.image || null,
        source: it.source || r.job.sourceName || r.job.label.replace(/^(keyword|manager): /, 'Google News · '),
        tier: r.job.tier, pubDate: it.pubDate, key,
      };
      const existing = byKey.get(key);
      if (!existing || cand.tier < existing.tier) byKey.set(key, cand);
    });
  });
  let collected = [...byKey.values()];
  const collectedCount = collected.length;

  // ---- 4. Dedup against previous runs (if persistent store configured) ----
  let persistentDedup = false;
  if (rememberSeen) {
    const { unseen, persistent } = await filterUnseen(collected.map((c) => c.key));
    persistentDedup = persistent;
    const set = new Set(unseen);
    collected = collected.filter((c) => set.has(c.key));
  }

  collected.sort((a, b) => b.pubDate - a.pubDate);
  const forFilter = collected.slice(0, Number(maxItems));

  if (!forFilter.length) {
    return res.status(200).json({ collectedCount, newCount: 0, included: [], borderline: [], feedErrors, persistentDedup, managerInfo });
  }

  // ---- 5. Filter + cluster in one Claude call (returns JSON, not prose) ----
  const list = forFilter
    .map((it, i) => `${i + 1}. ${it.title}  [${it.source} · ${it.pubDate.toISOString().slice(0, 10)}]`)
    .join('\n');

  const systemPrompt =
    `You screen news for an impact-investing newsletter. Keep ONLY articles about the creation, launch, or ` +
    `fundraising of an investment FUND meeting every criterion below.\n\n` + criteriaBlock +
    `\n\nEDGE CASES:\n` +
    `- "Fund X reaches first close" / "LPs commit to Fund Y" -> include.\n` +
    `- "Fund X invests $10M in Company Y" -> exclude (that is a portfolio investment, not fund fundraising).\n` +
    `- "Startup raises Series A from Fund W" -> exclude.\n` +
    `- Fund clearly focused on US / Western Europe / developed markets -> exclude.\n` +
    `- Unsure -> mark "borderline" rather than dropping.\n\n` +
    `CLUSTER duplicates: if several articles cover the same fund event, put their numbers in one group's "members".\n\n` +
    `Return ONLY JSON, no prose, no code fences:\n` +
    `{"groups":[{"members":[<article numbers>],"decision":"include|borderline","manager":"","fund":"","region":"","theme":""}]}\n` +
    `Use "" for unknown fields. Omit excluded articles entirely.`;

  let parsed;
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: FILTER_MODEL, max_tokens: 3000, system: systemPrompt,
        messages: [{ role: 'user', content: 'ARTICLES:\n' + list }],
      }),
    });
    const data = await upstream.json();
    if (!upstream.ok) throw new Error(data?.error?.message || 'Anthropic API error');
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').replace(/```json|```/g, '').trim();
    parsed = JSON.parse(text);
  } catch (e) {
    return res.status(500).json({ error: 'Filter step failed: ' + String(e.message || e) });
  }

  // ---- 6. Resolve each group to its best-tier article ----
  function resolveGroup(g) {
    const members = (g.members || [])
      .map((n) => forFilter[n - 1])
      .filter(Boolean)
      .sort((a, b) => a.tier - b.tier || b.pubDate - a.pubDate); // best tier, then newest
    if (!members.length) return null;
    const best = members[0];
    return {
      title: best.title, link: best.link, source: best.source, image: best.image,
      pubDate: best.pubDate, tier: best.tier,
      manager: g.manager || '', fund: g.fund || '', region: g.region || '', theme: g.theme || '',
      alsoCoveredBy: members.slice(1).map((m) => m.source).filter((v, i, a) => a.indexOf(v) === i),
      _key: best.key,
    };
  }

  const groups = (parsed.groups || []).map(resolveGroup).filter(Boolean);
  const included = groups.filter((_, i) => (parsed.groups[i].decision || 'include') !== 'borderline');
  const borderline = groups.filter((_, i) => (parsed.groups[i].decision || '') === 'borderline');

  // ---- 7. Rich previews for the (small) selected set, best-effort ----
  if (richPreviews) {
    const selected = [...included, ...borderline];
    await pool(selected, async (item) => {
      const p = await fetchPreview(item.link);
      if (p.finalUrl) item.link = p.finalUrl;         // resolve Google News redirect to the real article
      if (!item.image && p.image) item.image = p.image;
      if (p.description) item.description = p.description;
      if (p.siteName && (!item.source || item.source.startsWith('Google News'))) item.source = p.siteName;
      return null;
    }, 6);
  }

  // ---- 8. Remember what we delivered ----
  if (rememberSeen) await markSeen(forFilter.map((c) => c.key));

  return res.status(200).json({
    collectedCount, newCount: forFilter.length,
    included, borderline, feedErrors, persistentDedup, managerInfo,
  });
}
