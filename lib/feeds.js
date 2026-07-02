import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// Google News (and some publishers) reject requests with no User-Agent.
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

/** Strip Google News' redirect wrapper + query noise so the same story dedups across keywords/sources. */
export function normLink(link) {
  let s = String(link || '').trim().toLowerCase();
  s = s.replace(/^https?:\/\/news\.google\.com\/rss\/articles\//, '');
  s = s.split('?')[0].split('#')[0].replace(/\/$/, '');
  return s;
}

/**
 * Fetch + parse one feed URL. Returns { items, error }.
 * Tolerant of both RSS 2.0 (<channel><item>) and Atom (<feed><entry>).
 * Never throws — a broken feed shows up as `error`, not a crashed run.
 */
export async function fetchFeed(url, timeoutMs = 12000) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) return { items: [], error: `HTTP ${resp.status}` };
    const xml = await resp.text();
    const obj = parser.parse(xml);

    if (obj?.rss?.channel) {
      const items = asArray(obj.rss.channel.item).map((it) => {
        const source = it.source ? textOf(it.source) : null;
        return {
          title: textOf(it.title),
          link: textOf(it.link),
          source,
          pubDate: parseDate(textOf(it.pubDate)),
        };
      });
      return { items, error: null };
    }

    if (obj?.feed?.entry) {
      const entries = asArray(obj.feed.entry).map((en) => {
        const links = asArray(en.link);
        const href = links.find((l) => l?.['@_rel'] === 'alternate')?.['@_href'] || links[0]?.['@_href'] || '';
        return {
          title: textOf(en.title),
          link: href,
          source: null,
          pubDate: parseDate(textOf(en.published) || textOf(en.updated)),
        };
      });
      return { items: entries, error: null };
    }

    return { items: [], error: 'Unrecognized feed format' };
  } catch (e) {
    return { items: [], error: e.name === 'AbortError' ? 'Timed out' : String(e.message || e) };
  }
}

export function googleNewsUrl(keyword, daysAgo) {
  const q = `"${keyword}" when:${daysAgo}d`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en&gl=US&ceid=US:en`;
}
