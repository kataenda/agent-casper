"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Repeat, ArrowDown, ArrowLeft, ShieldCheck, ExternalLink, Loader2,
  History, Bot, Hand, RefreshCw, Activity,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ACCENT = "#FF4D6D"; // CSPR.trade-flavored accent
const CLIP = "polygon(14px 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%,0 14px)";

const TOKENS_OUT = ["sCSPR", "CD_LONG", "CD_SHORT", "STAMP", "GHTST1", "GHTST3"];

interface Quote {
  amountOutFormatted?: string;
  priceImpact?: string;
  recommendedSlippageBps?: string;
  pathSymbols?: string[];
  tokenOutSymbol?: string;
}

interface Swap {
  tx_hash?: string | null;
  amount?: string;
  token_in?: string;
  token_out?: string;
  explorer_url?: string | null;
  executed?: boolean;
  settlement?: string;
  triggered_by?: string;
  ts?: string;
}

/* ── Chamfered panel wrapper ──────────────────────────────────────── */
function Card({ children, className = "", accent = ACCENT }: {
  children: React.ReactNode; className?: string; accent?: string;
}) {
  return (
    <div className="relative p-[1.5px] h-full"
         style={{ clipPath: CLIP, background: accent, filter: `drop-shadow(0 0 18px ${accent}55)` }}>
      <div className={`relative h-full ${className}`} style={{ clipPath: CLIP, background: "rgba(2,3,7,0.99)" }}>
        <div style={{
          position: "absolute", top: 0, left: "8%", right: "8%", height: 2,
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          boxShadow: `0 0 12px 2px ${accent}88`,
        }} />
        {children}
      </div>
    </div>
  );
}

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-cyber-muted">{k}</span>
      <span style={{ color: color || "#fff" }}>{v}</span>
    </div>
  );
}

/* ── Trigger source badge ─────────────────────────────────────────── */
function TriggerBadge({ by }: { by?: string }) {
  const isAgent = by && by !== "manual";
  const color = isAgent ? "#00F5FF" : "#BF5AF2";
  const label = !by ? "—" : by === "manual" ? "MANUAL" : `AI · ${by.toUpperCase()}`;
  const Icon = isAgent ? Bot : Hand;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[8px] uppercase tracking-widest"
          style={{ color, background: `${color}12`, border: `1px solid ${color}33` }}>
      <Icon size={8} /> {label}
    </span>
  );
}

function fmtTime(ts?: string) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return ts; }
}

export default function SwapPage() {
  // ── Swap form state ──
  const [tokenOut, setTokenOut] = useState("sCSPR");
  const [amount, setAmount] = useState("10");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<any>(null);

  // ── History state ──
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  const reset = () => { setQuote(null); setResult(null); setErr(null); setConfirming(false); };

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch(`${API}/defi/history?limit=50`);
      const d = await r.json();
      setSwaps(Array.isArray(d.swaps) ? d.swaps : []);
    } catch { /* keep prior */ } finally { setHistLoading(false); }
  }, []);

  useEffect(() => {
    loadHistory();
    const t = setInterval(loadHistory, 15000);
    return () => clearInterval(t);
  }, [loadHistory]);

  async function getQuote() {
    setLoading(true); setErr(null); setResult(null); setConfirming(false);
    try {
      const r = await fetch(`${API}/defi/quote?token_in=CSPR&token_out=${tokenOut}&amount=${amount}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "quote failed");
      setQuote(d);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }

  async function executeSwap() {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`${API}/defi/swap`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_in: "CSPR", token_out: tokenOut, amount, execute: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "swap failed");
      setResult(d);
      loadHistory(); // refresh history right after a swap lands
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); setConfirming(false); }
  }

  const executedCount = swaps.filter(s => s.executed).length;
  const aiCount = swaps.filter(s => s.triggered_by && s.triggered_by !== "manual").length;

  return (
    <div className="min-h-screen px-4 py-4 md:px-8 md:py-6" style={{ maxWidth: 1400, margin: "0 auto" }}>

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Link href="/"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-mono text-[10px] uppercase tracking-widest transition-opacity hover:opacity-70"
                style={{ borderColor: "rgba(0,245,255,0.35)", color: "#00F5FF", background: "rgba(0,245,255,0.06)" }}>
            <ArrowLeft size={12} /> Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <Repeat size={18} style={{ color: ACCENT, filter: `drop-shadow(0 0 8px ${ACCENT})` }} />
            <div>
              <h1 className="font-mono font-bold uppercase tracking-[0.15em] text-sm" style={{ color: ACCENT }}>
                Real DeFi · Swap
              </h1>
              <p className="text-[9px] font-mono text-cyber-muted uppercase tracking-[0.15em]">
                Non-custodial · Casper Mainnet · CSPR.trade MCP
              </p>
            </div>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-[9px] uppercase tracking-widest"
              style={{ color: "#00FF94", background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.3)" }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#00FF94", boxShadow: "0 0 6px #00FF94" }} />
          Mainnet Live
        </span>
      </header>

      {/* ── Stat strip ──────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { icon: History,  label: "Total Swaps",     value: String(swaps.length),  accent: ACCENT },
          { icon: ShieldCheck, label: "Executed On-Chain", value: String(executedCount), accent: "#00FF94" },
          { icon: Bot,      label: "AI-Triggered",    value: String(aiCount),       accent: "#00F5FF" },
        ].map(({ icon: Icon, label, value, accent }) => (
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
            <div className="font-mono font-black leading-none" style={{ fontSize: 26, color: accent, textShadow: `0 0 14px ${accent}99` }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Main: swap form + history ───────────────────────────── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0, 420px) 1fr" }}>

        {/* ── Swap form ── */}
        <Card>
          <div className="p-5">
            {/* From */}
            <div className="rounded-lg p-3 mb-1" style={{ background: `${ACCENT}06`, border: `1px solid ${ACCENT}22` }}>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono uppercase tracking-widest text-cyber-muted">From</span>
                <span className="font-mono text-[11px] font-bold" style={{ color: ACCENT }}>CSPR</span>
              </div>
              <input value={amount} onChange={e => { setAmount(e.target.value.replace(/[^\d.]/g, "")); reset(); }}
                     className="w-full bg-transparent font-mono font-bold text-2xl mt-1 outline-none"
                     style={{ color: "#fff" }} placeholder="0" inputMode="decimal" />
            </div>

            <div className="flex justify-center -my-2 relative z-10">
              <div className="rounded-full p-1" style={{ background: "#020307", border: `1px solid ${ACCENT}40` }}>
                <ArrowDown size={12} style={{ color: ACCENT }} />
              </div>
            </div>

            {/* To */}
            <div className="rounded-lg p-3 mt-1 mb-4" style={{ background: `${ACCENT}06`, border: `1px solid ${ACCENT}22` }}>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono uppercase tracking-widest text-cyber-muted">To</span>
                <select value={tokenOut} onChange={e => { setTokenOut(e.target.value); reset(); }}
                        className="bg-transparent font-mono text-[11px] font-bold outline-none cursor-pointer"
                        style={{ color: ACCENT }}>
                  {TOKENS_OUT.map(t => <option key={t} value={t} style={{ background: "#020307" }}>{t}</option>)}
                </select>
              </div>
              <div className="font-mono font-bold text-2xl mt-1" style={{ color: quote ? "#fff" : "#ffffff40" }}>
                {quote?.amountOutFormatted ? Number(quote.amountOutFormatted).toFixed(4) : "—"}
              </div>
            </div>

            {/* Quote detail */}
            {quote && (
              <div className="rounded-lg p-3 mb-3 text-[10px] font-mono space-y-1"
                   style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <Row k="Route" v={(quote.pathSymbols || []).join(" → ")} />
                <Row k="Price impact" v={`${Number(quote.priceImpact || 0).toFixed(3)}%`}
                     color={Number(quote.priceImpact) > 2 ? "#FF3B5C" : "#00FF94"} />
                <Row k="Rec. slippage" v={`${(Number(quote.recommendedSlippageBps || 0) / 100).toFixed(2)}%`} />
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="rounded-lg p-3 mb-3 text-[10px] font-mono"
                   style={{ background: `${ACCENT}08`, border: `1px solid ${ACCENT}30` }}>
                <div className="flex items-center gap-1.5 mb-1" style={{ color: ACCENT }}>
                  <ShieldCheck size={11} /> {result.executed ? "Swap submitted on mainnet" : `Status: ${result.settlement}`}
                </div>
                {result.tx_hash && (
                  <a href={result.explorer_url || `https://cspr.live/transaction/${result.tx_hash}`} target="_blank" rel="noreferrer"
                     className="flex items-center gap-1 hover:opacity-75 break-all" style={{ color: "#00D4FF" }}>
                    {result.tx_hash.slice(0, 16)}…{result.tx_hash.slice(-8)} <ExternalLink size={9} />
                  </a>
                )}
                {result.note && <div className="text-cyber-muted/70 mt-1">{result.note}</div>}
              </div>
            )}

            {err && <div className="text-[10px] font-mono text-red-400 mb-3 break-words">⚠ {err}</div>}

            {/* Actions */}
            {!confirming ? (
              <div className="flex gap-2">
                <button onClick={getQuote} disabled={loading || !amount}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest transition-all hover:opacity-85 disabled:opacity-40"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}>
                  {loading && !result ? <Loader2 size={12} className="animate-spin" /> : null} Get Quote
                </button>
                <button onClick={() => setConfirming(true)} disabled={!quote || loading}
                        className="flex-1 rounded-lg py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest transition-all hover:opacity-85 disabled:opacity-30"
                        style={{ background: ACCENT, color: "#fff", boxShadow: `0 0 20px ${ACCENT}55` }}>
                  Execute Swap
                </button>
              </div>
            ) : (
              <div className="rounded-lg p-3" style={{ background: "rgba(255,59,92,0.08)", border: "1px solid rgba(255,59,92,0.3)" }}>
                <p className="text-[10px] font-mono text-white/90 mb-2">
                  ⚠ This sends a <b>real transaction on Casper mainnet</b> and spends real CSPR (≈ {amount} CSPR + ~30 gas). Continue?
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirming(false)} className="flex-1 rounded-lg py-2 font-mono text-[10px] uppercase tracking-widest"
                          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}>Cancel</button>
                  <button onClick={executeSwap} disabled={loading}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 font-mono text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
                          style={{ background: "#FF3B5C", color: "#fff" }}>
                    {loading ? <Loader2 size={12} className="animate-spin" /> : null} Confirm
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mt-3 pt-2 text-[8px] font-mono"
                 style={{ borderTop: `1px solid ${ACCENT}1a`, color: "rgba(255,255,255,0.4)" }}>
              <span>signed locally · agent key · non-custodial</span>
              <span className="uppercase tracking-widest" style={{ color: ACCENT }}>Casper Mainnet</span>
            </div>
          </div>
        </Card>

        {/* ── Swap history ── */}
        <Card accent="#00D4FF">
          <div className="p-4 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <History size={13} style={{ color: "#00D4FF" }} />
              <span className="font-mono font-bold uppercase tracking-[0.18em] text-[11px]" style={{ color: "#00D4FF" }}>
                Swap History
              </span>
              <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(0,212,255,0.4), transparent)" }} />
              <button onClick={loadHistory} title="Refresh"
                      className="flex items-center gap-1 text-[8px] font-mono uppercase tracking-widest text-cyber-muted hover:text-white transition-colors">
                <RefreshCw size={9} className={histLoading ? "animate-spin" : ""} /> Auto · 15s
              </button>
            </div>

            {/* Table head */}
            <div className="grid items-center gap-2 px-2 py-1.5 font-mono text-[8px] uppercase tracking-widest text-cyber-muted shrink-0"
                 style={{ gridTemplateColumns: "1.4fr 1fr 1.1fr 1.3fr 0.9fr", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <span>Pair</span><span>Amount</span><span>Source</span><span>Tx</span><span className="text-right">Time</span>
            </div>

            {/* Rows */}
            <div className="flex-1 overflow-y-auto" style={{ maxHeight: 460, scrollbarWidth: "thin", scrollbarColor: "rgba(0,212,255,0.3) transparent" }}>
              {histLoading && swaps.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-12 font-mono text-[10px] text-cyber-muted">
                  <Loader2 size={12} className="animate-spin" /> Loading history…
                </div>
              ) : swaps.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 font-mono text-[10px] text-cyber-muted">
                  <Activity size={18} style={{ opacity: 0.4 }} />
                  No swaps yet — execute one to see it here.
                </div>
              ) : (
                swaps.map((s, i) => (
                  <div key={(s.tx_hash || "") + i}
                       className="grid items-center gap-2 px-2 py-2 font-mono text-[10px] transition-colors hover:bg-white/[0.03]"
                       style={{ gridTemplateColumns: "1.4fr 1fr 1.1fr 1.3fr 0.9fr", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    {/* Pair */}
                    <span className="flex items-center gap-1 truncate" style={{ color: "#fff" }}>
                      <span className="text-cyber-muted">{s.token_in}</span>
                      <ArrowDown size={8} className="-rotate-90" style={{ color: ACCENT }} />
                      <span style={{ color: ACCENT }}>{s.token_out}</span>
                    </span>
                    {/* Amount */}
                    <span style={{ color: "#fff" }}>{s.amount}</span>
                    {/* Source */}
                    <TriggerBadge by={s.triggered_by} />
                    {/* Tx */}
                    {s.tx_hash ? (
                      <a href={s.explorer_url || `https://cspr.live/transaction/${s.tx_hash}`} target="_blank" rel="noreferrer"
                         className="flex items-center gap-1 hover:opacity-75 truncate" style={{ color: "#00D4FF" }}>
                        {s.tx_hash.slice(0, 8)}… <ExternalLink size={8} />
                      </a>
                    ) : (
                      <span className="text-cyber-muted">{s.settlement || "—"}</span>
                    )}
                    {/* Time */}
                    <span className="text-right text-cyber-muted">{fmtTime(s.ts)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="shrink-0 mt-2 pt-2 text-[8px] font-mono text-cyber-muted/60"
                 style={{ borderTop: "1px solid rgba(0,212,255,0.12)" }}>
              Persistent on-chain swap log · verified on cspr.live (Casper mainnet)
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
