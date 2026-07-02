import React, { useState, useMemo } from "react";
import Head from "next/head";
import { Plus, X, Play, Copy, Check, ChevronDown, ChevronRight, CircleDot, Mail, AlertTriangle } from "lucide-react";
import defaultKeywords from "../config/keywords.json";
import defaultSources from "../config/sources.json";
import defaultCriteria from "../config/criteria.json";

const C = {
  ink: "#1e2b27",
  page: "#eaeeea",
  panel: "#ffffff",
  line: "#dbe1dc",
  muted: "#5f6f68",
  accent: "#3f8f5c",
  include: "#57b26a",
  border: "#c99a2e",
  exclude: "#b34a40",
  chipOn: "#e3efe7",
};
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export default function ImpactPulseApp() {
  const [days, setDays] = useState(8);
  const [maxItems, setMaxItems] = useState(200);
  const [rememberSeen, setRememberSeen] = useState(true);

  const [keywords, setKeywords] = useState(defaultKeywords);
  const [sources, setSources] = useState(defaultSources.map((s) => ({ ...s })));

  const [regionsIn, setRegionsIn] = useState(defaultCriteria.regionsIn);
  const [regionsOut, setRegionsOut] = useState(defaultCriteria.regionsOut);
  const [themes, setThemes] = useState(defaultCriteria.themes.map((t) => ({ label: t, on: true })));
  const [rules, setRules] = useState(defaultCriteria.rules);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { collectedCount, newCount, digest, feedErrors, items }
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const [emailTo, setEmailTo] = useState("");
  const [emailStatus, setEmailStatus] = useState(""); // "", "sending", "sent", or an error string

  const activeThemes = themes.filter((t) => t.on).map((t) => t.label);
  const criteriaBlock = useMemo(
    () =>
      [
        `TARGET REGIONS (include): ${regionsIn.join(", ") || "—"}`,
        `EXCLUDE REGIONS: ${regionsOut.join(", ") || "—"}`,
        `IMPACT THEMES: ${activeThemes.join(", ") || "—"}`,
        `RULES:\n${rules}`,
      ].join("\n"),
    [regionsIn, regionsOut, activeThemes, rules]
  );

  const activeSourceCount = sources.filter((s) => s.active && s.url).length;
  const activeKeywordCount = keywords.filter(Boolean).length;

  async function run() {
    setError("");
    setResult(null);
    setEmailStatus("");
    setRunning(true);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords, sources, days, maxItems, criteriaBlock, rememberSeen,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResult(data);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setRunning(false);
    }
  }

  async function sendEmail() {
    if (!result?.digest || !emailTo.trim()) return;
    setEmailStatus("sending");
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailTo, digest: result.digest }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      setEmailStatus("sent");
    } catch (e) {
      setEmailStatus(String(e.message || e));
    }
  }

  function copyDigest() {
    if (!result?.digest) return;
    navigator.clipboard?.writeText(result.digest);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div style={{ background: C.page, color: C.ink, fontFamily: SANS }} className="min-h-screen p-5 sm:p-8">
      <Head>
        <title>Impact Pulse — News Digest</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="mx-auto" style={{ maxWidth: 960 }}>
        <Header />

        <Panel>
          <SectionTitle n="A" title="Parameters" sub="How wide and how far back this run searches." />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Look-back window">
              <div className="flex items-center gap-2">
                <input type="number" value={days} min={1} max={90} onChange={(e) => setDays(+e.target.value)}
                  className="w-20 px-2 py-1 rounded border outline-none" style={{ borderColor: C.line }} />
                <span className="text-sm" style={{ color: C.muted }}>days</span>
              </div>
            </Field>
            <Field label="Max items screened">
              <input type="number" value={maxItems} min={10} max={500} onChange={(e) => setMaxItems(+e.target.value)}
                className="w-24 px-2 py-1 rounded border outline-none" style={{ borderColor: C.line }} />
            </Field>
            <Field label="Skip previously-seen items">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={rememberSeen} onChange={(e) => setRememberSeen(e.target.checked)} />
                {rememberSeen ? "On" : "Off (re-screen everything)"}
              </label>
            </Field>
          </div>
        </Panel>

        <Panel>
          <SectionTitle n="B" title="Keywords" sub="Searched against Google News for the look-back window above." />
          <ChipEditor items={keywords} setItems={setKeywords} tone={C.accent} placeholder="add keyword + Enter" />
        </Panel>

        <Panel>
          <SectionTitle n="C" title="Sources" sub="Curated feeds. Tier 1 = primary DFI announcements, highest precision." />
          <div className="space-y-2">
            {sources.map((s, idx) => (
              <div key={idx}>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => setSources(sources.map((x, i) => i === idx ? { ...x, active: !x.active } : x))}
                    title={s.active ? "Active" : "Muted"} style={{ color: s.active ? C.include : C.line }}>
                    <CircleDot size={18} />
                  </button>
                  <input value={s.name} onChange={(e) => setSources(sources.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                    className="px-2 py-1 rounded border text-sm outline-none" style={{ borderColor: C.line, width: 220 }} placeholder="Name" />
                  <input value={s.url} onChange={(e) => setSources(sources.map((x, i) => i === idx ? { ...x, url: e.target.value } : x))}
                    className="px-2 py-1 rounded border text-sm outline-none flex-1" style={{ borderColor: C.line, minWidth: 180 }} placeholder="RSS URL" />
                  <select value={s.tier} onChange={(e) => setSources(sources.map((x, i) => i === idx ? { ...x, tier: +e.target.value } : x))}
                    className="px-2 py-1 rounded border text-sm outline-none" style={{ borderColor: C.line }}>
                    <option value={1}>Tier 1</option><option value={2}>Tier 2</option><option value={3}>Tier 3</option>
                  </select>
                  <button onClick={() => setSources(sources.filter((_, i) => i !== idx))} style={{ color: C.muted }}><X size={16} /></button>
                </div>
                {s.notes && !s.url && (
                  <div className="text-xs mt-1 ml-7 flex items-start gap-1" style={{ color: C.border }}>
                    <AlertTriangle size={12} style={{ marginTop: 2, flexShrink: 0 }} /> <span>{s.notes}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button onClick={() => setSources([...sources, { name: "", url: "", tier: 2, active: true, notes: "" }])}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium" style={{ color: C.accent }}>
            <Plus size={15} /> Add source
          </button>
        </Panel>

        <Panel>
          <SectionTitle n="D" title="Criteria" sub="What the filter step keeps." />
          <ChipEditor label="Target regions (include)" items={regionsIn} setItems={setRegionsIn} tone={C.include} />
          <ChipEditor label="Exclude regions" items={regionsOut} setItems={setRegionsOut} tone={C.exclude} />
          <div className="mt-4">
            <div className="text-sm font-semibold mb-2">Impact themes</div>
            <div className="flex flex-wrap gap-2">
              {themes.map((t, idx) => (
                <button key={t.label} onClick={() => setThemes(themes.map((x, i) => i === idx ? { ...x, on: !x.on } : x))}
                  className="px-3 py-1 rounded-full text-sm border"
                  style={{ borderColor: t.on ? C.accent : C.line, background: t.on ? C.chipOn : "transparent", color: t.on ? C.ink : C.muted }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <div className="text-sm font-semibold mb-2">Include / exclude rules</div>
            <textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={4}
              className="w-full px-3 py-2 rounded border text-sm outline-none leading-relaxed" style={{ borderColor: C.line }} />
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm font-semibold">Ready to run</div>
              <div className="text-sm" style={{ color: C.muted }}>
                {activeKeywordCount} keyword{activeKeywordCount === 1 ? "" : "s"} · {activeSourceCount} active source{activeSourceCount === 1 ? "" : "s"} · last {days} days
              </div>
            </div>
            <button onClick={run} disabled={running}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded text-sm font-semibold text-white"
              style={{ background: running ? C.muted : C.ink }}>
              <Play size={16} /> {running ? "Searching and screening…" : "Run search + filter"}
            </button>
          </div>
          {error && <div className="mt-3 text-sm whitespace-pre-wrap" style={{ color: C.exclude }}>{error}</div>}
        </Panel>

        {result && (
          <Panel>
            <SectionTitle n="E" title="Digest" sub={
              `${result.collectedCount} items collected · ${result.newCount} screened` +
              (result.persistentDedup ? " · repeat items filtered against past runs" : " · repeat-run memory not configured, see below")
            } />

            {result.feedErrors?.length > 0 && (
              <div className="mb-4 text-xs p-2 rounded" style={{ background: "#fbf3e8", color: "#7a5a1e" }}>
                <div className="font-semibold mb-1">{result.feedErrors.length} feed{result.feedErrors.length === 1 ? "" : "s"} didn't return results:</div>
                {result.feedErrors.map((e, i) => <div key={i}>{e.source} — {e.error}</div>)}
              </div>
            )}

            <MarkdownTable md={result.digest} />

            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <button onClick={copyDigest} className="inline-flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded border" style={{ borderColor: C.line }}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy digest"}
              </button>
              <div className="flex items-center gap-2">
                <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="you@tameo.solutions, colleague@tameo.solutions"
                  className="px-2 py-1.5 rounded border text-sm outline-none" style={{ borderColor: C.line, width: 260 }} />
                <button onClick={sendEmail} disabled={emailStatus === "sending" || !emailTo.trim()}
                  className="inline-flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded border" style={{ borderColor: C.line }}>
                  <Mail size={14} /> {emailStatus === "sending" ? "Sending…" : "Email digest"}
                </button>
              </div>
            </div>
            {emailStatus === "sent" && <div className="text-sm mt-2" style={{ color: C.include }}>Sent.</div>}
            {emailStatus && emailStatus !== "sending" && emailStatus !== "sent" && (
              <div className="text-sm mt-2 whitespace-pre-wrap" style={{ color: C.exclude }}>{emailStatus}</div>
            )}

            <button onClick={() => setShowRaw(!showRaw)} className="flex items-center gap-1 text-sm font-medium mt-5" style={{ color: C.accent }}>
              {showRaw ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Raw items screened ({result.items?.length || 0})
            </button>
            {showRaw && (
              <div className="mt-2 space-y-1 max-h-80 overflow-y-auto">
                {result.items?.map((it, i) => (
                  <div key={i} className="text-xs p-2 rounded" style={{ background: C.page }}>
                    <a href={it.link} target="_blank" rel="noreferrer" style={{ color: C.ink }}>{it.title}</a>
                    <div style={{ color: C.muted }}>{it.source} · {new Date(it.pubDate).toDateString()}</div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}

        <p className="text-xs mt-6" style={{ color: C.muted }}>
          Filter calls run through this app's own server — the Anthropic key never reaches the browser.
          Repeat-run memory needs a Vercel KV integration; without it, each run re-screens the full look-back window
          (harmless, just occasionally repeats a story you've already seen). Email needs a Resend account — see DEPLOY.md.
        </p>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div style={{ width: 10, height: 10, borderRadius: 999, background: C.include }} />
        <div style={{ width: 10, height: 10, borderRadius: 999, background: "#3a3aa0" }} />
        <div style={{ width: 10, height: 10, borderRadius: 999, background: C.exclude }} />
        <span className="text-xs tracking-widest uppercase ml-1" style={{ color: C.muted }}>Tameo · Impact Pulse</span>
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>News Digest</h1>
      <p className="mt-2 text-sm" style={{ color: C.muted, maxWidth: 600 }}>
        Search keyword and curated feeds, filter for genuine emerging-market impact fund launches, and get a digest — start to finish, in one run.
      </p>
    </div>
  );
}

function Panel({ children }) {
  return <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12 }} className="p-5 sm:p-6 mb-4">{children}</div>;
}

function SectionTitle({ n, title, sub }) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-mono" style={{ color: C.accent }}>{n}</span>
        <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</h2>
      </div>
      {sub && <p className="text-sm mt-1" style={{ color: C.muted }}>{sub}</p>}
    </div>
  );
}

function Field({ label, children }) {
  return <div><div className="text-sm font-semibold mb-2">{label}</div>{children}</div>;
}

function ChipEditor({ label, items, setItems, tone, placeholder = "add + Enter" }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="mt-4 first:mt-0">
      {label && <div className="text-sm font-semibold mb-2">{label}</div>}
      <div className="flex flex-wrap gap-2 items-center">
        {items.map((it, i) => (
          <span key={it + i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm"
            style={{ background: C.chipOn, color: C.ink, borderLeft: `3px solid ${tone}` }}>
            {it}
            <button onClick={() => setItems(items.filter((_, idx) => idx !== i))} style={{ color: C.muted }}><X size={13} /></button>
          </span>
        ))}
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { setItems([...items, draft.trim()]); setDraft(""); } }}
          placeholder={placeholder}
          className="px-2 py-1 rounded border text-sm outline-none" style={{ borderColor: C.line, width: 150 }} />
      </div>
    </div>
  );
}

function MarkdownTable({ md }) {
  const lines = (md || "").split("\n").filter((l) => l.includes("|"));
  if (lines.length < 2) return <p className="text-sm whitespace-pre-wrap">{md}</p>;

  const tableRows = [];
  const afterTable = [];
  let inTable = true;
  (md || "").split("\n").forEach((line) => {
    const looksLikeRow = line.includes("|") && !/^\s*\|?[\s:\-|]+\|?\s*$/.test(line);
    const isSeparator = line.includes("|") && /^\s*\|?[\s:\-|]+\|?\s*$/.test(line);
    if (looksLikeRow) {
      if (inTable) tableRows.push(line); else afterTable.push(line);
    } else if (isSeparator) {
      // skip separator rows entirely
    } else {
      if (tableRows.length) inTable = false;
      afterTable.push(line);
    }
  });

  return (
    <div>
      <div className="overflow-x-auto">
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <tbody>
            {tableRows.map((line, idx) => {
              const cells = line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
              const Tag = idx === 0 ? "th" : "td";
              return (
                <tr key={idx}>
                  {cells.map((c, ci) => (
                    <Tag key={ci} style={{
                      textAlign: "left", padding: "8px 10px", border: `1px solid ${C.line}`,
                      background: idx === 0 ? C.ink : "transparent", color: idx === 0 ? "#fff" : C.ink,
                      fontWeight: idx === 0 ? 600 : 400,
                    }}>{c}</Tag>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {afterTable.some((l) => l.trim()) && (
        <div className="text-sm mt-3 whitespace-pre-wrap" style={{ color: C.muted }}>
          {afterTable.join("\n").trim()}
        </div>
      )}
    </div>
  );
}
