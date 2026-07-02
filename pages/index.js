import React, { useState, useMemo, useEffect } from "react";
import Head from "next/head";
import { Plus, X, Play, Copy, Check, ChevronDown, ChevronRight, CircleDot, Link2, AlertTriangle, ExternalLink, RotateCcw } from "lucide-react";
import defaultKeywords from "../config/keywords.json";
import defaultSources from "../config/sources.json";
import defaultCriteria from "../config/criteria.json";
import managersList from "../config/managers.json";

// Palette sampled from Tameo's rebranded (dark) site + brand deck.
const C = {
  bg: "#000000",
  surface: "#141615",
  inset: "#1f2321",
  line: "#2a2f2c",
  text: "#f1f6f2",
  muted: "#8b9490",
  accent: "#8ad98a",     // bright brand green
  accentDeep: "#6cc27c",
  onAccent: "#06130b",
  include: "#8ad98a",
  border: "#d9a441",     // amber — borderline (functional)
  exclude: "#e75655",    // brand coral
  chipBg: "#18231c",
  chipText: "#cde9d3",
};
const SANS = "'Euclid Circular A', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const STORE_KEY = "impactpulse.config.v1";

export default function ImpactPulseApp() {
  const [days, setDays] = useState(8);
  const [maxItems, setMaxItems] = useState(200);
  const [rememberSeen, setRememberSeen] = useState(true);
  const [searchManagers, setSearchManagers] = useState(true);
  const [managerBatch, setManagerBatch] = useState(25);
  const [richPreviews, setRichPreviews] = useState(true);

  const [keywords, setKeywords] = useState(defaultKeywords);
  const [managers, setManagers] = useState(managersList);
  const [sources, setSources] = useState(defaultSources.map((s) => ({ ...s })));
  const [regionsIn, setRegionsIn] = useState(defaultCriteria.regionsIn);
  const [regionsOut, setRegionsOut] = useState(defaultCriteria.regionsOut);
  const [themes, setThemes] = useState(defaultCriteria.themes.map((t) => ({ label: t, on: true })));
  const [rules, setRules] = useState(defaultCriteria.rules);

  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (saved) {
        setDays(saved.days ?? 8); setMaxItems(saved.maxItems ?? 200);
        setRememberSeen(saved.rememberSeen ?? true); setSearchManagers(saved.searchManagers ?? true);
        setManagerBatch(saved.managerBatch ?? 25); setRichPreviews(saved.richPreviews ?? true);
        if (saved.keywords) setKeywords(saved.keywords);
        if (Array.isArray(saved.managers)) setManagers(saved.managers);
        if (saved.sources) setSources(saved.sources);
        if (saved.regionsIn) setRegionsIn(saved.regionsIn);
        if (saved.regionsOut) setRegionsOut(saved.regionsOut);
        if (saved.themes) setThemes(saved.themes);
        if (typeof saved.rules === "string") setRules(saved.rules);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        days, maxItems, rememberSeen, searchManagers, managerBatch, richPreviews,
        keywords, managers, sources, regionsIn, regionsOut, themes, rules,
      }));
    } catch {}
  }, [days, maxItems, rememberSeen, searchManagers, managerBatch, richPreviews, keywords, managers, sources, regionsIn, regionsOut, themes, rules]);

  const activeThemes = themes.filter((t) => t.on).map((t) => t.label);
  const criteriaBlock = useMemo(() => [
    `TARGET REGIONS (include): ${regionsIn.join(", ") || "—"}`,
    `EXCLUDE REGIONS: ${regionsOut.join(", ") || "—"}`,
    `IMPACT THEMES: ${activeThemes.join(", ") || "—"}`,
    `RULES:\n${rules}`,
  ].join("\n"), [regionsIn, regionsOut, activeThemes, rules]);

  const activeSourceCount = sources.filter((s) => s.active && s.url).length;

  function resetConfig() {
    setDays(8); setMaxItems(200); setRememberSeen(true); setSearchManagers(true); setManagerBatch(25); setRichPreviews(true);
    setKeywords(defaultKeywords); setManagers(managersList); setSources(defaultSources.map((s) => ({ ...s })));
    setRegionsIn(defaultCriteria.regionsIn); setRegionsOut(defaultCriteria.regionsOut);
    setThemes(defaultCriteria.themes.map((t) => ({ label: t, on: true }))); setRules(defaultCriteria.rules);
  }

  async function run() {
    setError(""); setResult(null); setRunning(true); setCollapsed(true);
    setStage(searchManagers ? "Searching keywords, sources, and a batch of managers…" : "Searching keywords and sources…");
    const t = setTimeout(() => setStage(richPreviews ? "Filtering, clustering duplicates, building previews…" : "Filtering and clustering duplicates…"), 4000);
    try {
      const res = await fetch("/api/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, sources, managers, days, maxItems, criteriaBlock, rememberSeen, searchManagers, managerBatch, richPreviews }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResult(data);
    } catch (e) {
      setError(String(e.message || e)); setCollapsed(false);
    } finally {
      clearTimeout(t); setRunning(false); setStage("");
    }
  }

  function toMarkdown() {
    if (!result) return "";
    const row = (it) => `| ${it.manager || "—"} | ${it.fund || "—"} | ${it.region || "—"} | ${it.theme || "—"} | ${it.source || "—"} | [${(it.title || "").replace(/\|/g, "/")}](${it.link}) |`;
    let md = "| Manager | Fund | Region | Theme | Source | Story |\n|---|---|---|---|---|---|\n";
    md += (result.included || []).map(row).join("\n");
    if (result.borderline?.length) md += "\n\n**Borderline — review**\n\n" + result.borderline.map(row).join("\n");
    return md;
  }
  function selectedItems() { return result ? [...(result.included || []), ...(result.borderline || [])] : []; }
  function copy(kind) {
    let text = "";
    if (kind === "links") text = selectedItems().map((it) => it.link).join("\n");
    else if (kind === "titledLinks") text = selectedItems().map((it) => `${it.title}\n${it.link}`).join("\n\n");
    else text = toMarkdown();
    navigator.clipboard?.writeText(text);
    setCopied(kind); setTimeout(() => setCopied(""), 1400);
  }

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: SANS, minHeight: "100vh" }}>
      <Head><title>Impact Pulse — News Digest</title><meta name="robots" content="noindex" /></Head>

      {/* Site-style top bar: white logo on black, hairline divider */}
      <div style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="mx-auto flex items-center justify-between" style={{ maxWidth: 980, padding: "16px 20px" }}>
          <img src="/tameo-logo-white.svg" alt="Tameo" style={{ height: 24, width: "auto" }} />
          <span className="text-xs tracking-widest uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Impact Pulse</span>
        </div>
      </div>

      <div className="mx-auto p-5 sm:p-8" style={{ maxWidth: 980 }}>
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase mb-3" style={{ color: C.accent, letterSpacing: "0.14em", fontWeight: 600 }}>News monitoring</div>
            <button onClick={resetConfig} title="Reset to defaults" className="inline-flex items-center gap-1 text-xs" style={{ color: C.muted }}><RotateCcw size={12} /> Reset</button>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.08, color: "#fff" }}>News Digest</h1>
          <p className="mt-2 text-sm" style={{ color: C.muted, maxWidth: 620 }}>
            Search keyword feeds, curated sources, and a fund-manager watchlist; filter for genuine emerging-market impact fund launches; get a deduplicated digest with links — in one run.
          </p>
        </div>

        {collapsed && (
          <button onClick={() => setCollapsed(false)} className="inline-flex items-center gap-1 text-sm font-medium mb-4" style={{ color: C.accent }}>
            <ChevronRight size={16} /> Show settings
          </button>
        )}

        <div style={{ display: collapsed ? "none" : "block" }}>
          <Panel>
            <SectionTitle n="A" title="Parameters" sub="How wide and how far back this run searches." />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label="Look-back window">
                <div className="flex items-center gap-2">
                  <input type="number" value={days} min={1} max={90} onChange={(e) => setDays(+e.target.value)} className="w-20 px-2 py-1 rounded border outline-none" style={inputStyle} />
                  <span className="text-sm" style={{ color: C.muted }}>days</span>
                </div>
              </Field>
              <Field label="Max items screened">
                <input type="number" value={maxItems} min={10} max={500} onChange={(e) => setMaxItems(+e.target.value)} className="w-24 px-2 py-1 rounded border outline-none" style={inputStyle} />
              </Field>
              <Field label="Skip previously-seen">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rememberSeen} onChange={(e) => setRememberSeen(e.target.checked)} />{rememberSeen ? "On" : "Off"}</label>
              </Field>
              <Field label="Rich link previews">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={richPreviews} onChange={(e) => setRichPreviews(e.target.checked)} />{richPreviews ? "On (images + links)" : "Off (faster)"}</label>
              </Field>
              <Field label="Search manager watchlist">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={searchManagers} onChange={(e) => setSearchManagers(e.target.checked)} />{searchManagers ? "On" : "Off"}</label>
              </Field>
              {searchManagers && (
                <Field label={`Managers per run (of ${managersList.length})`}>
                  <div className="flex items-center gap-2">
                    <input type="number" value={managerBatch} min={5} max={80} onChange={(e) => setManagerBatch(+e.target.value)} className="w-20 px-2 py-1 rounded border outline-none" style={inputStyle} />
                    <span className="text-xs" style={{ color: C.muted }}>rotates weekly</span>
                  </div>
                </Field>
              )}
            </div>
          </Panel>

          <Panel>
            <SectionTitle n="B" title="Keywords" sub="Searched against Google News for the look-back window." />
            <ChipEditor items={keywords} setItems={setKeywords} tone={C.accent} placeholder="add keyword + Enter" />
          </Panel>

          <Panel>
            <SectionTitle n="C" title="Sources" sub="Direct publisher RSS feeds — separate from keywords. These give clean links, images, and higher precision. Tier 1 (primary DFI announcements) wins when the same story also appears in Google News. Rows without a URL are placeholders and do nothing until you add one." />
            <div className="space-y-2">
              {sources.map((s, idx) => {
                const status = !s.url ? { label: "needs URL", color: C.border } : s.active ? { label: "active", color: C.accent } : { label: "muted", color: C.muted };
                return (
                <div key={idx}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setSources(sources.map((x, i) => i === idx ? { ...x, active: !x.active } : x))} title={s.active ? "Active" : "Muted"} style={{ color: s.active && s.url ? C.accent : C.line }}><CircleDot size={18} /></button>
                    <input value={s.name} onChange={(e) => setSources(sources.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} className="px-2 py-1 rounded border text-sm outline-none" style={{ ...inputStyle, width: 200 }} placeholder="Name" />
                    <input value={s.url} onChange={(e) => setSources(sources.map((x, i) => i === idx ? { ...x, url: e.target.value } : x))} className="px-2 py-1 rounded border text-sm outline-none flex-1" style={{ ...inputStyle, minWidth: 160 }} placeholder="RSS feed URL" />
                    <select value={s.tier} onChange={(e) => setSources(sources.map((x, i) => i === idx ? { ...x, tier: +e.target.value } : x))} className="px-2 py-1 rounded border text-sm outline-none" style={inputStyle}>
                      <option value={1}>Tier 1</option><option value={2}>Tier 2</option><option value={3}>Tier 3</option>
                    </select>
                    <span className="text-xs" style={{ color: status.color, minWidth: 62 }}>{status.label}</span>
                    <button onClick={() => setSources(sources.filter((_, i) => i !== idx))} style={{ color: C.muted }}><X size={16} /></button>
                  </div>
                  {s.notes && !s.url && (
                    <div className="text-xs mt-1 ml-7 flex items-start gap-1" style={{ color: C.muted }}><AlertTriangle size={12} style={{ marginTop: 2, flexShrink: 0, color: C.border }} /> <span>{s.notes}</span></div>
                  )}
                </div>
              );})}
            </div>
            <button onClick={() => setSources([...sources, { name: "", url: "", tier: 2, active: true, notes: "" }])} className="mt-3 inline-flex items-center gap-1 text-sm font-medium" style={{ color: C.accent }}><Plus size={15} /> Add source</button>
          </Panel>

          <Panel>
            <SectionTitle n="D" title="Manager watchlist" sub={`${managers.length} fund managers, searched in a weekly-rotating batch of ${managerBatch} (set in Parameters). Only used when manager search is on.`} />
            <ManagerWatchlist managers={managers} setManagers={setManagers} defaultList={managersList} />
          </Panel>

          <Panel>
            <SectionTitle n="E" title="Criteria" sub="What the filter step keeps." />
            <ChipEditor label="Target regions (include)" items={regionsIn} setItems={setRegionsIn} tone={C.include} />
            <ChipEditor label="Exclude regions" items={regionsOut} setItems={setRegionsOut} tone={C.exclude} />
            <div className="mt-4">
              <div className="text-sm font-semibold mb-2">Impact themes</div>
              <div className="flex flex-wrap gap-2">
                {themes.map((t, idx) => (
                  <button key={t.label} onClick={() => setThemes(themes.map((x, i) => i === idx ? { ...x, on: !x.on } : x))} className="px-3 py-1 rounded-full text-sm border" style={{ borderColor: t.on ? C.accent : C.line, background: t.on ? C.chipBg : "transparent", color: t.on ? C.chipText : C.muted }}>{t.label}</button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <div className="text-sm font-semibold mb-2">Include / exclude rules</div>
              <textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={4} className="w-full px-3 py-2 rounded border text-sm outline-none leading-relaxed" style={inputStyle} />
            </div>
          </Panel>
        </div>

        <Panel>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm font-semibold">Ready to run</div>
              <div className="text-sm" style={{ color: C.muted }}>
                {keywords.filter(Boolean).length} keywords · {activeSourceCount} sources{searchManagers ? ` · ${managerBatch} managers` : ""} · last {days} days
              </div>
            </div>
            <button onClick={run} disabled={running} className="inline-flex items-center gap-2 px-5 py-2.5 rounded text-sm font-semibold" style={{ background: running ? C.inset : C.accent, color: running ? C.muted : C.onAccent }}>
              <Play size={16} /> {running ? "Working…" : "Run search + filter"}
            </button>
          </div>
          {running && stage && <div className="text-sm mt-3" style={{ color: C.muted }}>{stage}</div>}
          {error && <div className="mt-3 text-sm whitespace-pre-wrap" style={{ color: C.exclude }}>{error}</div>}
        </Panel>

        {result && (
          <Panel>
            <SectionTitle n="F" title="Digest" sub={
              `${result.collectedCount} collected · ${result.included.length} funds` +
              (result.borderline?.length ? ` · ${result.borderline.length} borderline` : "") +
              (result.managerInfo ? ` · managers ${result.managerInfo.from + 1}–${result.managerInfo.to} of ${result.managerInfo.total}` : "") +
              (result.persistentDedup ? "" : " · repeat-run memory off")
            } />

            {result.feedErrors?.length > 0 && (
              <details className="mb-4">
                <summary className="text-xs cursor-pointer" style={{ color: C.border }}>{result.feedErrors.length} feed(s) returned nothing — details</summary>
                <div className="text-xs mt-1" style={{ color: C.muted }}>{result.feedErrors.map((e, i) => <div key={i}>{e.source} — {e.error}</div>)}</div>
              </details>
            )}

            {result.included.length === 0 && !result.borderline?.length && (
              <p className="text-sm" style={{ color: C.muted }}>No matching funds this round. Try widening the window or turning on more sources.</p>
            )}

            {result.included.map((it, i) => <Card key={i} item={it} tone={C.include} />)}

            {result.borderline?.length > 0 && (
              <>
                <div className="flex items-center gap-2 mt-5 mb-2">
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: C.border }} />
                  <span className="text-sm font-semibold">Borderline — worth a look</span>
                </div>
                {result.borderline.map((it, i) => <Card key={i} item={it} tone={C.border} />)}
              </>
            )}

            {selectedItems().length > 0 && (
              <div className="flex items-center gap-2 mt-5 flex-wrap">
                <button onClick={() => copy("links")} className="inline-flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded" style={{ background: C.accent, color: C.onAccent }}>
                  {copied === "links" ? <Check size={14} /> : <Link2 size={14} />} {copied === "links" ? "Copied" : "Copy links"}
                </button>
                <button onClick={() => copy("titledLinks")} className="inline-flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded border" style={{ borderColor: C.line, color: C.text }}>
                  {copied === "titledLinks" ? <Check size={14} /> : <Copy size={14} />} {copied === "titledLinks" ? "Copied" : "Copy titles + links"}
                </button>
                <button onClick={() => copy("table")} className="inline-flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded border" style={{ borderColor: C.line, color: C.text }}>
                  {copied === "table" ? <Check size={14} /> : <Copy size={14} />} {copied === "table" ? "Copied" : "Copy table"}
                </button>
                <span className="text-xs" style={{ color: C.muted }}>{selectedItems().length} link{selectedItems().length === 1 ? "" : "s"}</span>
              </div>
            )}
          </Panel>
        )}

        <p className="text-xs mt-6" style={{ color: C.muted }}>
          Filter model is set by the FILTER_MODEL env var (default claude-sonnet-5). Filter calls run server-side — the Anthropic key never reaches the browser.
          Manager watchlist ({managers.length}) is searched in a weekly-rotating batch to stay within serverless limits. Settings are saved in this browser.
          "Copy links" gives the selected stories' URLs, one per line, ready to paste into LinkedIn.
        </p>
      </div>
    </div>
  );
}

const inputStyle = { borderColor: C.line, background: "#0e1110", color: C.text };

function Card({ item, tone }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "13px 0", borderBottom: `1px solid ${C.line}` }}>
      {item.image && (
        <img src={item.image} alt="" width={116} height={78}
          style={{ width: 116, height: 78, objectFit: "cover", borderRadius: 6, flexShrink: 0, borderLeft: `3px solid ${tone}` }}
          onError={(e) => { e.target.style.display = "none"; }} />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <a href={item.link} target="_blank" rel="noreferrer" className="hover-underline" style={{ color: C.text, fontWeight: 600, fontSize: 15, lineHeight: 1.35, textDecoration: "none" }}>
          {item.title} <ExternalLink size={12} style={{ display: "inline", verticalAlign: "middle", color: C.muted }} />
        </a>
        <div className="text-xs mt-1" style={{ color: C.muted }}>
          {item.source}{item.tier === 1 ? " · primary source" : ""} · {new Date(item.pubDate).toDateString()}
        </div>
        {item.description && <div className="text-sm mt-1" style={{ color: C.muted, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.description}</div>}
        <div className="mt-2 flex flex-wrap gap-1">
          {[item.manager, item.fund, item.region, item.theme].filter(Boolean).map((v, i) => (
            <span key={i} className="text-xs px-2 py-0.5 rounded-full" style={{ background: C.chipBg, color: C.chipText }}>{v}</span>
          ))}
        </div>
        {item.alsoCoveredBy?.length > 0 && <div className="text-xs mt-1" style={{ color: "#6f7a75" }}>Also covered by {item.alsoCoveredBy.join(", ")}</div>}
      </div>
    </div>
  );
}

function ManagerWatchlist({ managers, setManagers, defaultList }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");
  const [bulk, setBulk] = useState(null); // string when in bulk-edit mode

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return managers
      .map((name, i) => ({ name, i }))
      .filter(({ name }) => !needle || name.toLowerCase().includes(needle));
  }, [managers, q]);

  function add() {
    const v = draft.trim();
    if (!v) return;
    if (!managers.some((m) => m.toLowerCase() === v.toLowerCase())) setManagers([...managers, v]);
    setDraft("");
  }
  function removeAt(i) { setManagers(managers.filter((_, idx) => idx !== i)); }

  if (bulk !== null) {
    return (
      <div>
        <div className="text-sm mb-2" style={{ color: C.muted }}>One name per line. Saving replaces the whole list.</div>
        <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={12}
          className="w-full px-3 py-2 rounded border text-sm outline-none" style={{ ...inputStyle, fontFamily: "ui-monospace, Menlo, monospace" }} />
        <div className="flex gap-2 mt-2">
          <button onClick={() => { const list = bulk.split("\n").map((s) => s.trim()).filter(Boolean); const seen = new Set(); const dedup = list.filter((n) => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); setManagers(dedup); setBulk(null); }}
            className="text-sm font-semibold px-3 py-1.5 rounded" style={{ background: C.accent, color: C.onAccent }}>Save list</button>
          <button onClick={() => setBulk(null)} className="text-sm font-medium px-3 py-1.5 rounded border" style={{ borderColor: C.line, color: C.text }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: C.accent }}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />} {open ? "Hide list" : "View & edit list"}
        </button>
        {open && (
          <>
            <button onClick={() => setBulk(managers.join("\n"))} className="text-xs" style={{ color: C.muted }}>Bulk edit</button>
            <button onClick={() => setManagers(defaultList)} className="text-xs" style={{ color: C.muted }}>Reset to default ({defaultList.length})</button>
          </>
        )}
      </div>

      {open && (
        <div className="mt-3">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${managers.length} names…`}
              className="px-2 py-1.5 rounded border text-sm outline-none" style={{ ...inputStyle, width: 220 }} />
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Add a manager + Enter"
              className="px-2 py-1.5 rounded border text-sm outline-none flex-1" style={{ ...inputStyle, minWidth: 180 }} />
            <button onClick={add} className="inline-flex items-center gap-1 text-sm font-medium px-2.5 py-1.5 rounded border" style={{ borderColor: C.line, color: C.text }}><Plus size={14} /> Add</button>
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8 }}>
            {filtered.length === 0 && <div className="text-sm p-3" style={{ color: C.muted }}>No matches.</div>}
            {filtered.map(({ name, i }) => (
              <div key={i} className="flex items-center justify-between px-3 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>
                <span className="text-sm">{name}</span>
                <button onClick={() => removeAt(i)} title="Remove" style={{ color: C.muted }}><X size={14} /></button>
              </div>
            ))}
          </div>
          <div className="text-xs mt-2" style={{ color: C.muted }}>
            {q.trim() ? `${filtered.length} shown · ` : ""}{managers.length} total
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({ children }) {
  return <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12 }} className="p-5 sm:p-6 mb-4">{children}</div>;
}
function SectionTitle({ n, title, sub }) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-2"><span className="text-xs font-mono" style={{ color: C.accent }}>{n}</span><h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", color: "#fff" }}>{title}</h2></div>
      {sub && <p className="text-sm mt-1" style={{ color: C.muted }}>{sub}</p>}
    </div>
  );
}
function Field({ label, children }) { return <div><div className="text-sm font-semibold mb-2">{label}</div>{children}</div>; }

function ChipEditor({ label, items, setItems, tone, placeholder = "add + Enter" }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="mt-4 first:mt-0">
      {label && <div className="text-sm font-semibold mb-2">{label}</div>}
      <div className="flex flex-wrap gap-2 items-center">
        {items.map((it, i) => (
          <span key={it + i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm" style={{ background: C.chipBg, color: C.chipText, borderLeft: `3px solid ${tone}` }}>
            {it}<button onClick={() => setItems(items.filter((_, idx) => idx !== i))} style={{ color: C.muted }}><X size={13} /></button>
          </span>
        ))}
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { setItems([...items, draft.trim()]); setDraft(""); } }} placeholder={placeholder} className="px-2 py-1 rounded border text-sm outline-none" style={{ ...inputStyle, width: 150 }} />
      </div>
    </div>
  );
}
