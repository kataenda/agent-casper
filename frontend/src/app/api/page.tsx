"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Code2, ArrowLeft, ExternalLink, Zap, Loader2, Server, Activity, BookOpen, X,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ACCENT = "#BF5AF2";
const CLIP = "polygon(14px 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%,0 14px)";

type Method = "GET" | "POST";
interface Endpoint {
  method: Method;
  path: string;
  desc: string;
  probe?: boolean;        // safe read-only GET — allow live "Try it"
  expect402?: boolean;    // paid endpoint — 402 without payment is the success signal
}
interface Group { title: string; accent: string; endpoints: Endpoint[]; }

const GROUPS: Group[] = [
  {
    title: "Agent",
    accent: "#00F5FF",
    endpoints: [
      { method: "GET",  path: "/agent/status",   desc: "Live agent state — running, paused, cycles, poll interval", probe: true },
      { method: "GET",  path: "/decisions",      desc: "Recent autonomous AI decisions (action, allocation, confidence)", probe: true },
      { method: "GET",  path: "/agent/history",  desc: "Full cycle history with on-chain tx hashes", probe: true },
      { method: "POST", path: "/agent/pause",    desc: "Pause the autonomous decision loop" },
      { method: "POST", path: "/agent/resume",   desc: "Resume the autonomous decision loop" },
      { method: "POST", path: "/rebalance/manual", desc: "Trigger a manual rebalance cycle now" },
      { method: "POST", path: "/chat",           desc: "Ask the agent (Claude) a question about its strategy" },
    ],
  },
  {
    title: "Portfolio & Market Data",
    accent: "#00FF94",
    endpoints: [
      { method: "GET", path: "/",          desc: "Service health check", probe: true },
      { method: "GET", path: "/portfolio", desc: "Current on-chain vault portfolio + allocation", probe: true },
      { method: "GET", path: "/yields",    desc: "Live Casper validator yield rates (CSPR.cloud)", probe: true },
    ],
  },
  {
    title: "DeFi · CSPR.trade (mainnet)",
    accent: "#FF4D6D",
    endpoints: [
      { method: "GET",  path: "/defi/quote?token_in=CSPR&token_out=sCSPR&amount=10", desc: "Live mainnet swap quote (read-only)", probe: true },
      { method: "GET",  path: "/defi/markets", desc: "Live CSPR.trade trading pairs", probe: true },
      { method: "GET",  path: "/defi/history", desc: "Persistent history of real mainnet swaps", probe: true },
      { method: "POST", path: "/defi/swap",    desc: "Build + (execute=true) broadcast a non-custodial mainnet swap" },
    ],
  },
  {
    title: "x402 · Agent Economy",
    accent: ACCENT,
    endpoints: [
      { method: "GET",  path: "/x402/info",      desc: "x402 config, roles, service catalog, facilitator support", probe: true },
      { method: "GET",  path: "/x402/supported", desc: "Proxy the facilitator's supported schemes", probe: true },
      { method: "GET",  path: "/x402/decision",  desc: "PAID — AI rebalance recommendation (402 without payment)", probe: true, expect402: true },
      { method: "GET",  path: "/x402/rwa-feed",  desc: "PAID — aggregated on-chain-verified RWA prices", probe: true, expect402: true },
      { method: "GET",  path: "/premium/yield-forecast", desc: "PAID — premium yield forecast (402 without payment)", probe: true, expect402: true },
    ],
  },
  {
    title: "Admin & Chain",
    accent: "#FF9F0A",
    endpoints: [
      { method: "GET",  path: "/admin/agent-address", desc: "Agent account hash + public key + faucet link", probe: true },
      { method: "GET",  path: "/admin/contract-info", desc: "Deployed vault contract hash + explorer link", probe: true },
      { method: "POST", path: "/admin/setup",         desc: "Register deployed contract + agent account (no restart)" },
      { method: "POST", path: "/rpc",                 desc: "Proxy a Casper JSON-RPC call through the backend" },
      { method: "POST", path: "/deploy",              desc: "Submit a signed deploy to the Casper node" },
      { method: "GET",  path: "/deploys/{deploy_hash}", desc: "Look up a deploy's execution status" },
    ],
  },
];

const TOTAL = GROUPS.reduce((n, g) => n + g.endpoints.length, 0);

/* ── Chamfered panel ──────────────────────────────────────────────── */
function Card({ children, accent = ACCENT }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className="relative p-[1.5px]" style={{ clipPath: CLIP, background: accent, filter: `drop-shadow(0 0 16px ${accent}44)` }}>
      <div className="relative" style={{ clipPath: CLIP, background: "rgba(2,3,7,0.99)" }}>
        <div style={{
          position: "absolute", top: 0, left: "8%", right: "8%", height: 2,
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, boxShadow: `0 0 12px 2px ${accent}88`,
        }} />
        {children}
      </div>
    </div>
  );
}

function MethodBadge({ m }: { m: Method }) {
  const color = m === "GET" ? "#00FF94" : "#FF9F0A";
  return (
    <span className="font-mono font-bold text-[8px] tracking-widest px-1.5 py-0.5 rounded shrink-0 w-[38px] text-center"
          style={{ color, background: `${color}14`, border: `1px solid ${color}40` }}>
      {m}
    </span>
  );
}

interface TryResult { status: number | string; ok: boolean; body: string; ms: number; }

export default function ApiPage() {
  const [results, setResults] = useState<Record<string, TryResult>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`${API}/`).then(r => setOnline(r.ok)).catch(() => setOnline(false));
  }, []);

  const clearResult = useCallback((path: string) => {
    setResults(s => { const n = { ...s }; delete n[path]; return n; });
  }, []);

  const tryIt = useCallback(async (ep: Endpoint) => {
    setBusy(b => ({ ...b, [ep.path]: true }));
    const t0 = performance.now();
    try {
      const r = await fetch(`${API}${ep.path}`);
      const raw = await r.text();
      let body = raw;
      try { body = JSON.stringify(JSON.parse(raw), null, 2); } catch { /* not JSON */ }
      if (body.length > 6000) body = body.slice(0, 6000) + "\n… (truncated)";
      const ok = ep.expect402 ? r.status === 402 : r.ok;
      setResults(s => ({ ...s, [ep.path]: { status: r.status, ok, body, ms: Math.round(performance.now() - t0) } }));
    } catch (e: any) {
      setResults(s => ({ ...s, [ep.path]: { status: "ERR", ok: false, body: String(e?.message || e), ms: Math.round(performance.now() - t0) } }));
    } finally {
      setBusy(b => ({ ...b, [ep.path]: false }));
    }
  }, []);

  return (
    <div className="min-h-screen px-4 py-4 md:px-8 md:py-6" style={{ maxWidth: 1300, margin: "0 auto" }}>

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-mono text-[10px] uppercase tracking-widest transition-opacity hover:opacity-70"
                style={{ borderColor: "rgba(0,245,255,0.35)", color: "#00F5FF", background: "rgba(0,245,255,0.06)" }}>
            <ArrowLeft size={12} /> Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <Code2 size={18} style={{ color: ACCENT, filter: `drop-shadow(0 0 8px ${ACCENT})` }} />
            <div>
              <h1 className="font-mono font-bold uppercase tracking-[0.15em] text-sm" style={{ color: ACCENT }}>
                API · Reference
              </h1>
              <p className="text-[9px] font-mono text-cyber-muted uppercase tracking-[0.15em]">
                FastAPI backend · REST + x402 · live "try it"
              </p>
            </div>
          </div>
        </div>
        <a href={`${API}/docs`} target="_blank" rel="noopener noreferrer"
           className="flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-[10px] uppercase tracking-widest transition-all hover:opacity-80"
           style={{ borderColor: `${ACCENT}55`, color: ACCENT, background: `${ACCENT}0d`, boxShadow: `0 0 10px ${ACCENT}22` }}>
          <BookOpen size={12} /> Open Swagger /docs <ExternalLink size={10} />
        </a>
      </header>

      {/* ── Stat strip ──────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { icon: Code2, label: "Endpoints", value: String(TOTAL), accent: ACCENT },
          {
            icon: Activity, label: "Backend",
            value: online === null ? "…" : online ? "ONLINE" : "OFFLINE",
            accent: online === false ? "#FF3B5C" : "#00FF94",
          },
          { icon: Server, label: "Base URL", value: API.replace(/^https?:\/\//, ""), accent: "#00F5FF", small: true },
        ].map(({ icon: Icon, label, value, accent, small }: any) => (
          <div key={label} className="relative px-4 py-3"
               style={{
                 background: `linear-gradient(135deg, rgba(0,0,3,0.99) 0%, ${accent}08 100%)`,
                 border: `1px solid ${accent}30`,
                 clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
               }}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono uppercase tracking-[0.22em] text-[8px]" style={{ color: `${accent}80` }}>{label}</span>
              <Icon size={11} style={{ color: accent, opacity: 0.5 }} />
            </div>
            <div className="font-mono font-black leading-none truncate"
                 style={{ fontSize: small ? 13 : 24, color: accent, textShadow: `0 0 14px ${accent}99`, paddingTop: small ? 6 : 0 }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Endpoint groups (masonry — cards pack tightly, no row-height gaps) ── */}
      <div style={{ columns: "460px 2", columnGap: "1rem" }}>
        {GROUPS.map(group => (
          <div key={group.title} style={{ breakInside: "avoid", marginBottom: "1rem" }}>
          <Card accent={group.accent}>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-mono font-bold uppercase tracking-[0.18em] text-[11px]" style={{ color: group.accent }}>
                  {group.title}
                </span>
                <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${group.accent}55, transparent)` }} />
                <span className="font-mono text-[9px] text-cyber-muted">{group.endpoints.length}</span>
              </div>

              <div className="flex flex-col gap-1.5">
                {group.endpoints.map(ep => {
                  const res = results[ep.path];
                  return (
                    <div key={ep.path} className="p-2 rounded transition-colors hover:bg-white/[0.025]"
                         style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="flex items-center gap-2">
                        <MethodBadge m={ep.method} />
                        <code className="font-mono text-[11px] font-bold truncate" style={{ color: "#fff" }}>
                          {ep.path}
                        </code>
                        {ep.expect402 && (
                          <span className="font-mono text-[7px] uppercase tracking-widest px-1 py-0.5 rounded shrink-0"
                                style={{ color: ACCENT, background: `${ACCENT}14`, border: `1px solid ${ACCENT}33` }}>
                            paid
                          </span>
                        )}
                        <div className="ml-auto flex items-center gap-2 shrink-0">
                          {res && (
                            <span className="font-mono text-[9px] font-bold"
                                  style={{ color: res.ok ? "#00FF94" : "#FF9F0A" }}>
                              {res.status}{ep.expect402 && res.ok ? " ✓" : ""}
                            </span>
                          )}
                          {ep.probe && (
                            <button onClick={() => tryIt(ep)} disabled={busy[ep.path]}
                                    className="flex items-center gap-1 text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border transition-all hover:opacity-80 disabled:opacity-50"
                                    style={{ borderColor: `${group.accent}44`, color: group.accent, background: `${group.accent}0a` }}>
                              {busy[ep.path] ? <Loader2 size={8} className="animate-spin" /> : <Zap size={8} />} Try
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-[9px] font-mono text-cyber-muted mt-1 leading-relaxed">{ep.desc}</p>

                      {/* Inline response panel (mini-Swagger) */}
                      {res?.body !== undefined && (
                        <div className="mt-2 rounded overflow-hidden" style={{ border: `1px solid ${res.ok ? "#00FF9433" : "#FF9F0A33"}` }}>
                          <div className="flex items-center justify-between px-2 py-1"
                               style={{ background: `${res.ok ? "#00FF94" : "#FF9F0A"}0d` }}>
                            <span className="font-mono text-[8px] uppercase tracking-widest flex items-center gap-1.5"
                                  style={{ color: res.ok ? "#00FF94" : "#FF9F0A" }}>
                              Response · {res.status}{ep.expect402 && res.ok ? " ✓" : ""}
                              <span className="text-cyber-muted">· {res.ms}ms</span>
                            </span>
                            <button onClick={() => clearResult(ep.path)}
                                    className="text-cyber-muted hover:text-white transition-colors" title="Close">
                              <X size={11} />
                            </button>
                          </div>
                          <pre className="overflow-auto font-mono text-[9px] leading-relaxed p-2 m-0"
                               style={{ maxHeight: 220, color: "#cfe", background: "rgba(0,0,0,0.5)",
                                        scrollbarWidth: "thin", scrollbarColor: "rgba(191,90,242,0.3) transparent" }}>
                            {res.body || "(empty body)"}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
          </div>
        ))}
      </div>

      <p className="text-[9px] font-mono text-cyber-muted/60 mt-5 text-center">
        Read-only GET endpoints can be probed live with "Try" · POST endpoints mutate state — use Swagger /docs to invoke them safely.
      </p>
    </div>
  );
}
