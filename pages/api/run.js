import { fetchFeed, googleNewsUrl, normLink } from '../../lib/feeds';
import { filterUnseen, markSeen } from '../../lib/dedup';

export const config = {
  maxDuration: 60, // Vercel Hobby caps at 60s; Pro allows more if this pipeline grows
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY is not set. Add it in Vercel → Project → Settings → Environment Variables, then redeploy.',
    });
  }

  const {
    keywords = [],
    sources = [],
    days = 8,
    maxItems = 200,
    criteriaBlock = '',
    rememberSeen = true, // set false to re-screen everything, e.g. when testing
  } = req.body || {};

  const minDate = new Date();
  minDate.setDate(minDate.getDate() - Number(days));

  // ---- 1. Collect ----
  const feedJobs = [];

  keywords.filter(Boolean).forEach((kw) => {
    feedJobs.push({ label: `keyword: ${kw}`, url: googleNewsUrl(kw, days) });
  });
  sources.filter((s) => s.active && s.url).forEach((s) => {
    feedJobs.push({ label: `source: ${s.name}`, url: s.url });
  });

  if (!feedJobs.length) {
    return res.status(400).json({ error: 'No keywords or active sources to search. Add at least one.' });
  }

  const feedResults = await Promise.all(
    feedJobs.map(async (job) => ({ job, ...(await fetchFeed(job.url)) }))
  );

  const feedErrors = feedResults
    .filter((r) => r.error)
    .map((r) => ({ source: r.job.label, error: r.error }));

  // ---- 2. Dedup (within run, by normalized link) ----
  const seenInRun = new Set();
  let collected = [];
  feedResults.forEach((r) => {
    r.items.forEach((it) => {
      if (!it.title || !it.link) return;
      if (it.pubDate < minDate) return;
      const key = normLink(it.link);
      if (seenInRun.has(key)) return;
      seenInRun.add(key);
      collected.push({ ...it, key, foundVia: r.job.label });
    });
  });

  const collectedCount = collected.length;

  // ---- 2b. Dedup against previous runs (if persistent store configured) ----
  let persistentDedup = false;
  if (rememberSeen) {
    const { unseen, persistent } = await filterUnseen(collected.map((c) => c.key));
    persistentDedup = persistent;
    const unseenSet = new Set(unseen);
    collected = collected.filter((c) => unseenSet.has(c.key));
  }

  collected.sort((a, b) => b.pubDate - a.pubDate);
  const forFilter = collected.slice(0, Number(maxItems));

  if (!forFilter.length) {
    return res.status(200).json({
      collectedCount,
      newCount: 0,
      digest: 'No matching funds found in this batch.',
      feedErrors,
      persistentDedup,
    });
  }

  // ---- 3. Filter (single Claude call) ----
  const list = forFilter
    .map((it, i) => `${i + 1}. ${it.title}  [${it.source || it.foundVia} | ${it.pubDate.toISOString().slice(0, 10)}]`)
    .join('\n');

  const systemPrompt =
    `You are an analyst screening news for an impact-investing newsletter. Return ONLY articles about the ` +
    `creation, launch, or fundraising of an investment FUND that meets every criterion below.\n\n` +
    criteriaBlock +
    `\n\nEDGE CASES:\n` +
    `- "Fund X reaches first close" -> INCLUDE.\n` +
    `- "Fund X invests $10M in Startup Y" -> EXCLUDE (company investment, not fund fundraising).\n` +
    `- "Startup raises Series A from Fund W" -> EXCLUDE.\n` +
    `- Fund clearly focused on the US/Western Europe/other developed markets -> EXCLUDE.\n` +
    `- Genuinely unclear -> keep it in a separate "Borderline — review" section rather than dropping it.\n\n` +
    `OUTPUT: a Markdown table with columns: Manager | Fund name | Target region | Theme | Source | Headline. ` +
    `Then, if applicable, a short "Borderline — review" section. ` +
    `If nothing matches, reply exactly: No matching funds found in this batch. No other prose, no preamble.`;

  let digest;
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'ARTICLES:\n' + list }],
      }),
    });
    const data = await upstream.json();
    if (!upstream.ok) throw new Error(data?.error?.message || 'Anthropic API error');
    digest = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  } catch (e) {
    return res.status(500).json({ error: 'Filter step failed: ' + String(e.message || e) });
  }

  // ---- 4. Mark delivered items as seen (best-effort, after successful filter) ----
  if (rememberSeen) {
    await markSeen(forFilter.map((c) => c.key));
  }

  return res.status(200).json({
    collectedCount,
    newCount: forFilter.length,
    digest,
    feedErrors,
    persistentDedup,
    items: forFilter.map((c) => ({ title: c.title, link: c.link, source: c.source || c.foundVia, pubDate: c.pubDate })),
  });
}
