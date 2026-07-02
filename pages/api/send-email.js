// Optional. Requires a Resend account (resend.com) with a verified sending
// domain. Without RESEND_API_KEY + DIGEST_FROM_EMAIL it returns a clear
// "not configured" message rather than failing silently.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_FROM_EMAIL;
  if (!apiKey || !from) {
    return res.status(400).json({
      error: 'Email delivery is not configured. Set RESEND_API_KEY and DIGEST_FROM_EMAIL in Vercel env vars (needs a Resend account with a verified domain). Until then, use "Copy digest".',
    });
  }

  const { to, included = [], borderline = [], subject } = req.body || {};
  if (!to || (!included.length && !borderline.length)) {
    return res.status(400).json({ error: 'Missing "to" or nothing to send.' });
  }

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to: String(to).split(',').map((s) => s.trim()).filter(Boolean),
        subject: subject || `Impact Pulse — fund news digest (${new Date().toDateString()})`,
        html: buildHtml(included, borderline),
      }),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json({ error: data?.message || 'Resend API error' });
    return res.status(200).json({ ok: true, id: data.id });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function tag(text) {
  if (!text) return '';
  return `<span style="display:inline-block;background:#e3efe7;color:#1e2b27;border-radius:10px;padding:1px 8px;font-size:11px;margin:0 4px 4px 0">${esc(text)}</span>`;
}

function card(item) {
  const meta = [item.manager, item.fund, item.region, item.theme].map(tag).join('');
  const img = item.image
    ? `<td width="120" valign="top" style="padding-right:12px"><img src="${esc(item.image)}" width="120" style="border-radius:6px;display:block" alt=""></td>`
    : '';
  const also = item.alsoCoveredBy?.length
    ? `<div style="font-size:11px;color:#8a988f;margin-top:4px">Also covered by ${esc(item.alsoCoveredBy.join(', '))}</div>` : '';
  return `<table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:16px;border-bottom:1px solid #e6ebe6;padding-bottom:14px"><tr>${img}<td valign="top">
    <a href="${esc(item.link)}" style="font-size:15px;font-weight:600;color:#1e2b27;text-decoration:none;line-height:1.35">${esc(item.title)}</a>
    <div style="font-size:12px;color:#5f6f68;margin:4px 0 6px">${esc(item.source || '')} · ${new Date(item.pubDate).toDateString()}</div>
    <div>${meta}</div>${also}
  </td></tr></table>`;
}

function buildHtml(included, borderline) {
  let html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#1e2b27">
    <h2 style="font-size:18px">Impact Pulse — fund news digest</h2>
    <p style="font-size:13px;color:#5f6f68">${included.length} fund${included.length === 1 ? '' : 's'} · ${new Date().toDateString()}</p>`;
  if (included.length) html += included.map(card).join('');
  else html += `<p style="font-size:14px;color:#5f6f68">No matching funds this round.</p>`;
  if (borderline.length) {
    html += `<h3 style="font-size:14px;color:#c99a2e;margin-top:20px">Borderline — worth a look</h3>` + borderline.map(card).join('');
  }
  return html + '</div>';
}
