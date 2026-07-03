import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; ImpactPulseBot/1.0; +https://tameo.solutions)',
};

function asArray(x) {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

function textOf(x) {
  if (x === undefined || x === null) return '';
  if (typeof x === 'string' || typeof x === 'number') return String(x);
  if (typeof x === 'object' && '#text' in x) return String(x['#text']);
  return '';
}

function parseDate(s) {
  const d = s ? new Date(s) : new Date(0);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

/** Best-effort image pulled straight from the feed item (media:content, enclosure, or first <img> in the body). */
function imageFromItem(it) {
  const media = it['media:content'] || it['media:thumbnail'];
  if (media) {
    const m = asArray(media)[0];
    if (m?.['@_url']) return m['@_url'];
  }
  if (it.enclosure) {
    const enc = asArray(it.enclosure)[0];
    if (enc?.['@_url'] && String(enc['@_type'] || '').startsWith('image')) return enc['@_url'];
  }
  const body = textOf(it['content:encoded']) || textOf(it.description) || textOf(it.summary);
  const m = body.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

/** Strip Google News' redirect wrapper + query noise so the same story dedups across keywords/sources. */
export function normLink(link) {
  let s = String(link || '').trim().toLowerCase();
  s = s.replace(/^https?:\/\/news\.google\.com\/rss\/articles\//, '');
  s = s.split('?')[0].split('#')[0].replace(/\/$/, '');
  return s;
}

/**
 * Fetch + parse one feed URL. Returns { items, error }. Never throws.
 * Tolerant of RSS 2.0 (<channel><item>) and Atom (<feed><entry>).
 */
export async function fetchFeed(url, timeoutMs = 6000) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return { items: [], error: `HTTP ${resp.status}` };

    const xml = await resp.text();
    const obj = parser.parse(xml);

    if (obj?.rss?.channel) {
      const items = asArray(obj.rss.channel.item).map((it) => ({
        title: textOf(it.title),
        link: textOf(it.link),
        source: it.source ? textOf(it.source) : null,
        pubDate: parseDate(textOf(it.pubDate)),
        image: imageFromItem(it),
      }));
      return { items, error: null };
    }

    if (obj?.feed?.entry) {
      const items = asArray(obj.feed.entry).map((en) => {
        const links = asArray(en.link);
        const href = links.find((l) => l?.['@_rel'] === 'alternate')?.['@_href'] || links[0]?.['@_href'] || '';
        return {
          title: textOf(en.title),
          link: href,
          source: null,
          pubDate: parseDate(textOf(en.published) || textOf(en.updated)),
          image: imageFromItem(en),
        };
      });
      return { items, error: null };
    }

    return { items: [], error: 'Unrecognized feed format' };
  } catch (e) {
    return { items: [], error: e.name === 'AbortError' ? 'Timed out' : String(e.message || e) };
  }
}

export function googleNewsUrl(query, daysAgo) {
  const q = `${query} when:${daysAgo}d`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en&gl=US&ceid=US:en`;
}

/** A Google News query for a fund manager: their name plus fund-event terms, to cut noise. */
export function managerQuery(name, daysAgo) {
  return googleNewsUrl(`"${name}" (fund OR close OR raises OR launches OR commitment)`, daysAgo);
}

/**
 * Deterministic weekly rotation through a long list, so each run searches a
 * bounded batch and the whole list is covered over several weeks — no stored
 * cursor needed.
 */
export function rotatingBatch(list, batchSize) {
  if (!list.length || batchSize <= 0) return { batch: [], from: 0, to: 0, total: list.length, batches: 0 };
  const batches = Math.ceil(list.length / batchSize);
  const weekIndex = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  const offset = (weekIndex % batches) * batchSize;
  const batch = list.slice(offset, offset + batchSize);
  return { batch, from: offset, to: offset + batch.length, total: list.length, batches };
}

/** Run async `worker` over `items` with bounded concurrency. */
export async function pool(items, worker, concurrency = 8) {
  const out = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return out;
}
