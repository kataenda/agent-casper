"use client";

import { useState } from "react";
import { Repeat, X, ArrowDown, ShieldCheck, ExternalLink, Loader2 } from "lucide-react";

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

export function DefiSwap() {
  const [open, setOpen] = useState(false);
  const [tokenOut, setTokenOut] = useState("sCSPR");
  const [amount, setAmount] = useState("10");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<any>(null);

  const reset = () => { setQuote(null); setResult(null); setErr(null); setConfirming(false); };

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
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); setConfirming(false); }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded border font-mono text-[9px] uppercase tracking-widest transition-all hover:opacity-80"
        style={{ borderColor: `${ACCENT}55`, color: ACCENT, background: `${ACCENT}0d`, boxShadow: `0 0 10px ${ACCENT}22` }}
        title="Real DeFi swap on Casper mainnet via CSPR.trade MCP"
      >
        <Repeat size={11} /> Swap
      </button>

      {open && (
        <div onClick={() => { setOpen(false); reset(); }}
             className="fixed inset-0 z-[100] flex items-center justify-center p-4"
             style={{ background: "rgba(0,0,3,0.82)", backdropFilter: "blur(6px)" }}>
          <div onClick={e => e.stopPropagation()} className="relative w-full max-w-[460px] p-[1.5px]"
               style={{ clipPath: CLIP, background: ACCENT, filter: `drop-shadow(0 0 24px ${ACCENT}88)` }}>
            <div className="relative p-5" style={{ clipPath: CLIP, background: "rgba(2,3,7,0.99)" }}>
              <div style={{ position: "absolute", top: 0, left: "8%", right: "8%", height: 2,
                background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, boxShadow: `0 0 12px 2px ${ACCENT}88` }} />

              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Repeat size={16} style={{ color: ACCENT }} />
                    <h2 className="font-mono font-bold uppercase tracking-[0.15em] text-sm" style={{ color: ACCENT }}>
                      Real DeFi · Swap
                    </h2>
                  </div>
                  <p className="text-[10px] font-mono text-cyber-muted mt-1 tracking-wide">
                    Non-custodial swap on Casper mainnet via CSPR.trade MCP
                  </p>
                </div>
                <button onClick={() => { setOpen(false); reset(); }} className="text-cyber-muted hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* From */}
              <div className="rounded-lg p-3 mb-1" style={{ background: `${ACCENT}06`, border: `1px solid ${ACCENT}22` }}>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-cyber-muted">From</span>
                  <span className="font-mono text-[11px] font-bold" style={{ color: ACCENT }}>CSPR</span>
                </div>
                <input value={amount} onChange={e => { setAmount(e.target.value.replace(/[^\d.]/g, "")); reset(); }}
                       className="w-full bg-transparent font-mono font-bold text-2xl mt-1 outline-none"
                       style={{ color: "#fff" }} placeholder="0" />
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
                    <a href={result.explorer_url || `https://cspr.live/deploy/${result.tx_hash}`} target="_blank" rel="noreferrer"
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

              {/* Footer */}
              <div className="flex items-center justify-between mt-3 pt-2 text-[8px] font-mono"
                   style={{ borderTop: `1px solid ${ACCENT}1a`, color: "rgba(255,255,255,0.4)" }}>
                <span>signed locally · agent key · non-custodial</span>
                <span className="uppercase tracking-widest" style={{ color: ACCENT }}>Casper Mainnet</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
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
