// Optional. Only works if you've added your own Resend account (resend.com) and
// verified a sending domain there. Without RESEND_API_KEY set, this route returns
// a clear "not configured" error instead of silently failing.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.DIGEST_FROM_EMAIL;
  if (!apiKey || !fromAddress) {
    return res.status(400).json({
      error:
        'Email delivery is not configured. Set RESEND_API_KEY and DIGEST_FROM_EMAIL in Vercel env vars ' +
        '(requires a Resend account with a verified sending domain). Until then, use "Copy digest" instead.',
    });
  }

  const { to, digest, subject } = req.body || {};
  if (!to || !digest) return res.status(400).json({ error: 'Missing "to" or "digest".' });

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: fromAddress,
        to: String(to).split(',').map((s) => s.trim()).filter(Boolean),
        subject: subject || `Impact Pulse — fund news digest (${new Date().toDateString()})`,
        html: mdToHtml(digest),
      }),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json({ error: data?.message || 'Resend API error' });
    return res.status(200).json({ ok: true, id: data.id });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}

function mdToHtml(md) {
  const lines = md.split('\n').filter((l) => l.includes('|'));
  if (lines.length < 2) return `<pre style="font-family:monospace;white-space:pre-wrap">${escapeHtml(md)}</pre>`;
  const rows = lines.filter((l) => !/^\s*\|?[\s:\-|]+\|?\s*$/.test(l));
  let html = '<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">';
  rows.forEach((line, idx) => {
    const cells = line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const tag = idx === 0 ? 'th' : 'td';
    const style = idx === 0 ? ' style="background:#2d413b;color:#fff"' : '';
    html += '<tr>' + cells.map((c) => `<${tag}${style}>${escapeHtml(c)}</${tag}>`).join('') + '</tr>';
  });
  return html + '</table>';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
