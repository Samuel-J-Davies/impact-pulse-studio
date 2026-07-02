import React, { useState, useMemo, useEffect } from "react";
import Head from "next/head";
import { Plus, X, Play, Copy, Check, ChevronDown, ChevronRight, CircleDot, Link2, AlertTriangle, ExternalLink, RotateCcw } from "lucide-react";
import defaultKeywords from "../config/keywords.json";
import defaultSources from "../config/sources.json";
import defaultCriteria from "../config/criteria.json";
import managersList from "../config/managers.json";

const C = {
  ink: "#1e2b27", page: "#eaeeea", panel: "#ffffff", line: "#dbe1dc", muted: "#5f6f68",
  accent: "#3f8f5c", include: "#57b26a", border: "#c99a2e", exclude: "#b34a40", chipOn: "#e3efe7",
};
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const STORE_KEY = "impactpulse.config.v1";

export default function ImpactPulseApp() {
  const [days, setDays] = useState(8);
  const [maxItems, setMaxItems] = useState(200);
  const [rememberSeen, setRememberSeen] = useState(true);
  const [searchManagers, setSearchManagers] = useState(true);
  const [managerBatch, setManagerBatch] = useState(25);
  const [richPreviews, setRichPreviews] = useState(true);

  const [keywords, setKeywords] = useState(defaultKeywords);
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

  // Persist config across visits (real browser storage — this is a deployed app, not a sandbox).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (saved) {
        setDays(saved.days ?? 8); setMaxItems(saved.maxItems ?? 200);
        setRememberSeen(saved.rememberSeen ?? true); setSearchManagers(saved.searchManagers ?? true);
        setManagerBatch(saved.managerBatch ?? 25); setRichPreviews(saved.richPreviews ?? true);
        if (saved.keywords) setKeywords(saved.keywords);
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
        keywords, sources, regionsIn, regionsOut, themes, rules,
      }));
    } catch {}
  }, [days, maxItems, rememberSeen, searchManagers, managerBatch, richPreviews, keywords, sources, regionsIn, regionsOut, themes, rules]);

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
    setKeywords(defaultKeywords); setSources(defaultSources.map((s) => ({ ...s })));
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
        body: JSON.stringify({ keywords, sources, days, maxItems, criteriaBlock, rememberSeen, searchManagers, managerBatch, richPreviews }),
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
  function selectedItems() {
    if (!result) return [];
    return [...(result.included || []), ...(result.borderline || [])];
  }
  function copy(kind) {
    let text = "";
    if (kind === "links") text = selectedItems().map((it) => it.link).join("\n");
    else if (kind === "titledLinks") text = selectedItems().map((it) => `${it.title}\n${it.link}`).join("\n\n");
    else text = toMarkdown();
    navigator.clipboard?.writeText(text);
    setCopied(kind); setTimeout(() => setCopied(""), 1400);
  }

  return (
    <div style={{ background: C.page, color: C.ink, fontFamily: SANS }} className="min-h-screen p-5 sm:p-8">
      <Head><title>Impact Pulse — News Digest</title><meta name="robots" content="noindex" /></Head>
      <div className="mx-auto" style={{ maxWidth: 980 }}>
        <Header onReset={resetConfig} />

        <div style={{ display: collapsed ? "block" : "none" }}>
          <button onClick={() => setCollapsed(false)} className="inline-flex items-center gap-1 text-sm font-medium mb-4" style={{ color: C.accent }}>
            <ChevronRight size={16} /> Show settings
          </button>
        </div>

        <div style={{ display: collapsed ? "none" : "block" }}>
          <Panel>
            <SectionTitle n="A" title="Parameters" sub="How wide and how far back this run searches." />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label="Look-back window">
                <div className="flex items-center gap-2">
                  <input type="number" value={days} min={1} max={90} onChange={(e) => setDays(+e.target.value)} className="w-20 px-2 py-1 rounded border outline-none" style={{ borderColor: C.line }} />
                  <span className="text-sm" style={{ color: C.muted }}>days</span>
                </div>
              </Field>
              <Field label="Max items screened">
                <input type="number" value={maxItems} min={10} max={500} onChange={(e) => setMaxItems(+e.target.value)} className="w-24 px-2 py-1 rounded border outline-none" style={{ borderColor: C.line }} />
              </Field>
              <Field label="Skip previously-seen">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rememberSeen} onChange={(e) => setRememberSeen(e.target.checked)} />{rememberSeen ? "On" : "Off"}</label>
              </Field>
              <Field label="Rich link previews">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={richPreviews} onChange={(e) => setRichPreviews(e.target.checked)} />{richPreviews ? "On (images + real links)" : "Off (faster)"}</label>
              </Field>
              <Field label="Search manager watchlist">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={searchManagers} onChange={(e) => setSearchManagers(e.target.checked)} />{searchManagers ? "On" : "Off"}</label>
              </Field>
              {searchManagers && (
                <Field label={`Managers per run (of ${managersList.length})`}>
                  <div className="flex items-center gap-2">
                    <input type="number" value={managerBatch} min={5} max={80} onChange={(e) => setManagerBatch(+e.target.value)} className="w-20 px-2 py-1 rounded border outline-none" style={{ borderColor: C.line }} />
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
            <SectionTitle n="C" title="Sources" sub="Curated feeds. Tier 1 = primary DFI announcements (best); when the same story appears in several, the highest tier wins." />
            <div className="space-y-2">
              {sources.map((s, idx) => (
                <div key={idx}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setSources(sources.map((x, i) => i === idx ? { ...x, active: !x.active } : x))} title={s.active ? "Active" : "Muted"} style={{ color: s.active ? C.include : C.line }}><CircleDot size={18} /></button>
                    <input value={s.name} onChange={(e) => setSources(sources.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} className="px-2 py-1 rounded border text-sm outline-none" style={{ borderColor: C.line, width: 220 }} placeholder="Name" />
                    <input value={s.url} onChange={(e) => setSources(sources.map((x, i) => i === idx ? { ...x, url: e.target.value } : x))} className="px-2 py-1 rounded border text-sm outline-none flex-1" style={{ borderColor: C.line, minWidth: 180 }} placeholder="RSS URL" />
                    <select value={s.tier} onChange={(e) => setSources(sources.map((x, i) => i === idx ? { ...x, tier: +e.target.value } : x))} className="px-2 py-1 rounded border text-sm outline-none" style={{ borderColor: C.line }}>
                      <option value={1}>Tier 1</option><option value={2}>Tier 2</option><option value={3}>Tier 3</option>
                    </select>
                    <button onClick={() => setSources(sources.filter((_, i) => i !== idx))} style={{ color: C.muted }}><X size={16} /></button>
                  </div>
                  {s.notes && !s.url && (
                    <div className="text-xs mt-1 ml-7 flex items-start gap-1" style={{ color: C.border }}><AlertTriangle size={12} style={{ marginTop: 2, flexShrink: 0 }} /> <span>{s.notes}</span></div>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setSources([...sources, { name: "", url: "", tier: 2, active: true, notes: "" }])} className="mt-3 inline-flex items-center gap-1 text-sm font-medium" style={{ color: C.accent }}><Plus size={15} /> Add source</button>
          </Panel>

          <Panel>
            <SectionTitle n="D" title="Criteria" sub="What the filter step keeps." />
            <ChipEditor label="Target regions (include)" items={regionsIn} setItems={setRegionsIn} tone={C.include} />
            <ChipEditor label="Exclude regions" items={regionsOut} setItems={setRegionsOut} tone={C.exclude} />
            <div className="mt-4">
              <div className="text-sm font-semibold mb-2">Impact themes</div>
              <div className="flex flex-wrap gap-2">
                {themes.map((t, idx) => (
                  <button key={t.label} onClick={() => setThemes(themes.map((x, i) => i === idx ? { ...x, on: !x.on } : x))} className="px-3 py-1 rounded-full text-sm border" style={{ borderColor: t.on ? C.accent : C.line, background: t.on ? C.chipOn : "transparent", color: t.on ? C.ink : C.muted }}>{t.label}</button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <div className="text-sm font-semibold mb-2">Include / exclude rules</div>
              <textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={4} className="w-full px-3 py-2 rounded border text-sm outline-none leading-relaxed" style={{ borderColor: C.line }} />
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
            <button onClick={run} disabled={running} className="inline-flex items-center gap-2 px-5 py-2.5 rounded text-sm font-semibold text-white" style={{ background: running ? C.muted : C.ink }}>
              <Play size={16} /> {running ? "Working…" : "Run search + filter"}
            </button>
          </div>
          {running && stage && <div className="text-sm mt-3" style={{ color: C.muted }}>{stage}</div>}
          {error && <div className="mt-3 text-sm whitespace-pre-wrap" style={{ color: C.exclude }}>{error}</div>}
        </Panel>

        {result && (
          <Panel>
            <SectionTitle n="E" title="Digest" sub={
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
                <button onClick={() => copy("links")} className="inline-flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded text-white" style={{ background: C.ink }}>
                  {copied === "links" ? <Check size={14} /> : <Link2 size={14} />} {copied === "links" ? "Copied" : "Copy links"}
                </button>
                <button onClick={() => copy("titledLinks")} className="inline-flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded border" style={{ borderColor: C.line }}>
                  {copied === "titledLinks" ? <Check size={14} /> : <Copy size={14} />} {copied === "titledLinks" ? "Copied" : "Copy titles + links"}
                </button>
                <button onClick={() => copy("table")} className="inline-flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded border" style={{ borderColor: C.line }}>
                  {copied === "table" ? <Check size={14} /> : <Copy size={14} />} {copied === "table" ? "Copied" : "Copy table"}
                </button>
                <span className="text-xs" style={{ color: C.muted }}>{selectedItems().length} link{selectedItems().length === 1 ? "" : "s"}</span>
              </div>
            )}
          </Panel>
        )}

        <p className="text-xs mt-6" style={{ color: C.muted }}>
          Filter model is set by the FILTER_MODEL env var (default claude-sonnet-5). Filter calls run server-side — the Anthropic key never reaches the browser.
          Manager watchlist ({managersList.length}) is searched in a weekly-rotating batch to stay within serverless limits. Settings are saved in this browser.
          "Copy links" gives you the selected stories' URLs, one per line, ready to paste into LinkedIn.
        </p>
      </div>
    </div>
  );
}

function Card({ item, tone }) {
  return (
    <div className="rounded" style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: `1px solid ${C.line}` }}>
      {item.image && (
        <img src={item.image} alt="" width={116} height={78}
          style={{ width: 116, height: 78, objectFit: "cover", borderRadius: 6, flexShrink: 0, borderLeft: `3px solid ${tone}` }}
          onError={(e) => { e.target.style.display = "none"; }} />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <a href={item.link} target="_blank" rel="noreferrer" style={{ color: C.ink, fontWeight: 600, fontSize: 15, lineHeight: 1.35, textDecoration: "none" }} className="hover-underline">
          {item.title} <ExternalLink size={12} style={{ display: "inline", verticalAlign: "middle", color: C.muted }} />
        </a>
        <div className="text-xs mt-1" style={{ color: C.muted }}>
          {item.source}{item.tier === 1 ? " · primary source" : ""} · {new Date(item.pubDate).toDateString()}
        </div>
        {item.description && <div className="text-sm mt-1" style={{ color: C.muted, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.description}</div>}
        <div className="mt-2 flex flex-wrap gap-1">
          {[item.manager, item.fund, item.region, item.theme].filter(Boolean).map((v, i) => (
            <span key={i} className="text-xs px-2 py-0.5 rounded-full" style={{ background: C.chipOn, color: C.ink }}>{v}</span>
          ))}
        </div>
        {item.alsoCoveredBy?.length > 0 && <div className="text-xs mt-1" style={{ color: "#8a988f" }}>Also covered by {item.alsoCoveredBy.join(", ")}</div>}
      </div>
    </div>
  );
}

function Header({ onReset }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 mb-3">
          <div style={{ width: 10, height: 10, borderRadius: 999, background: C.include }} />
          <div style={{ width: 10, height: 10, borderRadius: 999, background: "#3a3aa0" }} />
          <div style={{ width: 10, height: 10, borderRadius: 999, background: C.exclude }} />
          <span className="text-xs tracking-widest uppercase ml-1" style={{ color: C.muted }}>Tameo · Impact Pulse</span>
        </div>
        <button onClick={onReset} title="Reset to defaults" className="inline-flex items-center gap-1 text-xs" style={{ color: C.muted }}><RotateCcw size={12} /> Reset</button>
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>News Digest</h1>
      <p className="mt-2 text-sm" style={{ color: C.muted, maxWidth: 620 }}>
        Search keyword feeds, curated sources, and a fund-manager watchlist; filter for genuine emerging-market impact fund launches; get a deduplicated digest with links — in one run.
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
      <div className="flex items-baseline gap-2"><span className="text-xs font-mono" style={{ color: C.accent }}>{n}</span><h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</h2></div>
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
          <span key={it + i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm" style={{ background: C.chipOn, color: C.ink, borderLeft: `3px solid ${tone}` }}>
            {it}<button onClick={() => setItems(items.filter((_, idx) => idx !== i))} style={{ color: C.muted }}><X size={13} /></button>
          </span>
        ))}
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { setItems([...items, draft.trim()]); setDraft(""); } }} placeholder={placeholder} className="px-2 py-1 rounded border text-sm outline-none" style={{ borderColor: C.line, width: 150 }} />
      </div>
    </div>
  );
}
