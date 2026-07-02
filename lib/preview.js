const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; ImpactPulseBot/1.0; +https://tameo.solutions)',
  Accept: 'text/html,application/xhtml+xml',
};

function metaContent(html, ...names) {
  for (const name of names) {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, 'i'),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m) return decodeEntities(m[1]);
    }
  }
  return null;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x2F;/gi, '/');
}

/**
 * Fetch a rich preview for one URL. Returns { finalUrl, image, title, description, siteName }
 * or a minimal object on failure — never throws. Google News redirect links are
 * followed to the publisher where the platform allows it; when it can't be
 * resolved (JS-only redirects), image comes back null and the caller falls back
 * to the feed title/source.
 */
export async function fetchPreview(url, timeoutMs = 6000) {
  const base = { finalUrl: url, image: null, title: null, description: null, siteName: null };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: controller.signal });
    clearTimeout(timeout);

    const finalUrl = resp.url || url;
    if (!resp.ok) return { ...base, finalUrl };

    // Only parse HTML; skip large/binary responses.
    const type = resp.headers.get('content-type') || '';
    if (!type.includes('html')) return { ...base, finalUrl };

    const html = (await resp.text()).slice(0, 300000); // cap parse work
    return {
      finalUrl,
      image: metaContent(html, 'og:image', 'twitter:image', 'twitter:image:src'),
      title: metaContent(html, 'og:title', 'twitter:title'),
      description: metaContent(html, 'og:description', 'twitter:description', 'description'),
      siteName: metaContent(html, 'og:site_name'),
    };
  } catch {
    return base;
  }
}
