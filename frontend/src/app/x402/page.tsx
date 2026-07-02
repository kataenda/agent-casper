"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Store, ArrowLeft, Zap, ArrowDownLeft, ArrowUpRight, ShieldCheck,
  ExternalLink, Bot, Repeat, Coins, Network, X as XIcon,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ACCENT = "#00FF94";
const CLIP = "polygon(14px 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%,0 14px)";
const TESTNET = "https://testnet.cspr.live";

interface Service { resource: string; amount: number; description: string; }
interface Settlement {
  tx_hash: string; kind: string; label: string;
  from?: string; to?: string; amount?: string; ts?: string;
  explorer_url?: string; verified?: boolean;
}
interface X402Info {
  enabled: boolean;
  scheme?: string;
  network?: string;
  roles?: string[];
  payer_address?: string;
  asset?: string;
  token?: { name: string; version: string; decimals: number; symbol: string };
  facilitator_url?: string;
  provider?: { network: string; receives_to: string; services: Service[] };
}

/* Real, verified agent-to-agent on-chain settlements (Casper testnet, where the
   CEP-18 X402 token lives). These are immutable on-chain facts. */
const PROOFS = [
  {
    kind: "Agent → Agent",
    label: "Independent buyer pays provider",
    from: "00e2d5cd…", to: "0088cb6d…",
    tx: "eb0e914cdd902b177d95cd92a345cff3d7cdfbc33bffe8927d456d8c8a1f469e",
    accent: "#00F5FF",
  },
  {
    kind: "Agent → Agent",
    label: "Buyer pays provider (repeat — reproducible)",
    from: "00e2d5cd…", to: "0088cb6d…",
    tx: "aae75698ab2181750b8418b15597d20cdff650a0bc9ec55495f5b53a04cd71e3",
    accent: "#00F5FF",
  },
  {
    kind: "Settlement rail",
    label: "transfer_with_authorization (facilitator)",
    from: "agent", to: "agent",
    tx: "e297580fc01b3bd4bfb011a592f129822b253041bf643ce16aed6c34f4443fdc",
    accent: ACCENT,
  },
];
const TOKEN_PKG = "c61db3d7ed7565c6a770e03184c031cf6a2a10f35519726d6fed577c46d28a63";

/* ── Chamfered panel ──────────────────────────────────────────────── */
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

function RolePill({ icon: Icon, label, sub, color, active }: {
  icon: React.ElementType; label: string; sub: string; color: string; active: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded"
         style={{ background: active ? `${color}10` : "transparent", border: `1px solid ${active ? `${color}40` : "rgba(255,255,255,0.1)"}`, opacity: active ? 1 : 0.4 }}>
      <Icon size={13} style={{ color }} />
      <div className="leading-none">
        <div className="font-mono font-bold text-[10px] tracking-widest" style={{ color }}>{label}</div>
        <div className="font-mono text-[8px] text-cyber-muted mt-0.5">{sub}</div>
      </div>
    </div>
  );
}

function fmtPrice(amount: number, decimals = 9, symbol = "X402") {
  const v = amount / 10 ** decimals;
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${symbol}`;
}

export default function X402Page() {
  const [info, setInfo] = useState<X402Info | null>(null);
  const [probe, setProbe] = useState<Record<string, string>>({});
  // Live settlement history (falls back to the seeded PROOFS if the API is down).
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  // Which proof card's history modal is open (null = closed).
  const [modal, setModal] = useState<{ title: string; kind: string | null } | null>(null);

  useEffect(() => {
    fetch(`${API}/x402/info`).then(r => r.json()).then(setInfo).catch(() => {});
    fetch(`${API}/x402/settlements?limit=100`).then(r => r.json())
      .then(d => Array.isArray(d) && setSettlements(d)).catch(() => {});
  }, []);

  // History for the open modal: filter by the card's kind (null = all settlements).
  const modalRows: Settlement[] = (() => {
    const src = settlements.length ? settlements
      : PROOFS.map(p => ({ tx_hash: p.tx, kind: p.kind, label: p.label, from: p.from, to: p.to,
                           explorer_url: `${TESTNET}/transaction/${p.tx}` }));
    return modal?.kind ? src.filter(s => s.kind === modal.kind) : src;
  })();

  const probeEndpoint = useCallback(async (resource: string) => {
    setProbe(p => ({ ...p, [resource]: "…" }));
    try {
      const r = await fetch(`${API}${resource}`);
      setProbe(p => ({ ...p, [resource]: `HTTP ${r.status}${r.status === 402 ? " · Payment Required ✓" : ""}` }));
    } catch {
      setProbe(p => ({ ...p, [resource]: "unreachable" }));
    }
  }, []);

  const isProvider = !!info?.roles?.includes("provider");
  const isConsumer = !!info?.roles?.includes("consumer");
  const dec = info?.token?.decimals ?? 9;
  const sym = info?.token?.symbol ?? "X402";
  const services = info?.provider?.services ?? [];

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
            <Store size={18} style={{ color: ACCENT, filter: `drop-shadow(0 0 8px ${ACCENT})` }} />
            <div>
              <h1 className="font-mono font-bold uppercase tracking-[0.15em] text-sm" style={{ color: ACCENT }}>
                x402 · Agent Economy
              </h1>
              <p className="text-[9px] font-mono text-cyber-muted uppercase tracking-[0.15em]">
                Machine-to-machine commerce · CSPR.cloud exact scheme
              </p>
            </div>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-[9px] uppercase tracking-widest"
              style={{ color: ACCENT, background: `${ACCENT}12`, border: `1px solid ${ACCENT}33` }}>
          <Repeat size={10} /> Closed Loop
        </span>
      </header>

      {/* ── Stat strip ──────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { icon: Store, label: "Services Sold", value: String(services.length), accent: ACCENT },
          { icon: ShieldCheck, label: "On-Chain Settlements", value: String(PROOFS.length), accent: "#00F5FF" },
          { icon: Network, label: "Scheme", value: (info?.scheme || "exact").toUpperCase(), accent: "#BF5AF2" },
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
            <div className="font-mono font-black leading-none" style={{ fontSize: 24, color: accent, textShadow: `0 0 14px ${accent}99` }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Main: catalog + proof ───────────────────────────────── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>

        {/* ── Service catalog ── */}
        <Card>
          <div className="p-5 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-3">
              <Store size={13} style={{ color: ACCENT }} />
              <span className="font-mono font-bold uppercase tracking-[0.18em] text-[11px]" style={{ color: ACCENT }}>
                Service Catalog
              </span>
              <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${ACCENT}55, transparent)` }} />
            </div>
            <p className="text-[10px] font-mono text-cyber-muted mb-3 leading-relaxed">
              Services this agent <span style={{ color: ACCENT }}>sells</span> to other agents — paid per request over x402.
            </p>

            {/* Roles */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <RolePill icon={ArrowDownLeft} label="CONSUMER" sub="pays for data" color="#00D4FF" active={isConsumer} />
              <span className="font-mono text-cyber-muted text-xs">+</span>
              <RolePill icon={ArrowUpRight} label="PROVIDER" sub="gets paid" color={ACCENT} active={isProvider} />
            </div>

            {/* Services */}
            <div className="flex flex-col gap-2.5">
              {services.map(s => (
                <div key={s.resource} className="relative p-3"
                     style={{ background: `${ACCENT}06`, border: `1px solid ${ACCENT}22`,
                              clipPath: "polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)" }}>
                  <div className="flex items-center justify-between gap-3">
                    <code className="font-mono text-[12px] font-bold" style={{ color: ACCENT }}>{s.resource}</code>
                    <span className="font-mono text-[12px] font-black shrink-0" style={{ color: "#fff", textShadow: `0 0 10px ${ACCENT}` }}>
                      {fmtPrice(s.amount, dec, sym)}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-cyber-muted mt-1.5 leading-relaxed">{s.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => probeEndpoint(s.resource)}
                            className="text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border transition-all hover:opacity-80"
                            style={{ borderColor: `${ACCENT}44`, color: ACCENT, background: `${ACCENT}0a` }}>
                      <Zap size={8} className="inline mr-1" /> Try it (no payment)
                    </button>
                    {probe[s.resource] && (
                      <span className="text-[9px] font-mono" style={{ color: probe[s.resource].includes("402") ? ACCENT : "#FF9F0A" }}>
                        {probe[s.resource]}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {!services.length && <p className="text-[10px] font-mono text-cyber-muted">Loading catalog…</p>}
            </div>

            {/* Config meta */}
            <div className="mt-auto pt-3 text-[9px] font-mono space-y-1" style={{ borderTop: `1px solid ${ACCENT}1a`, color: "rgba(255,255,255,0.45)" }}>
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={10} style={{ color: ACCENT }} /> ed25519 proof · EIP-712 · settled via CSPR.cloud facilitator
              </div>
              {info?.token && (
                <div className="flex items-center gap-1.5">
                  <Coins size={10} style={{ color: ACCENT }} /> {info.token.name} ({info.token.symbol}) · CEP-18 · {info.token.decimals} dp
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* ── On-chain settlement proof ── */}
        <Card accent="#00F5FF">
          <div className="p-5 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-3">
              <Bot size={13} style={{ color: "#00F5FF" }} />
              <span className="font-mono font-bold uppercase tracking-[0.18em] text-[11px]" style={{ color: "#00F5FF" }}>
                Agent-to-Agent · On-Chain Proof
              </span>
              <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(0,245,255,0.5), transparent)" }} />
            </div>
            <p className="text-[10px] font-mono text-cyber-muted mb-3 leading-relaxed">
              Real CEP-18 <code style={{ color: "#00F5FF" }}>transfer_with_authorization</code> settlements — an independent
              buyer agent paying this agent, settled by the facilitator. The machine economy, literally on-chain.
            </p>

            <div className="flex flex-col gap-2.5 overflow-y-auto pr-1"
                 style={{ maxHeight: 360, scrollbarWidth: "thin", scrollbarColor: "rgba(0,245,255,0.3) transparent" }}>
              {PROOFS.map(p => {
                const count = (settlements.length
                  ? settlements.filter(s => s.kind === p.kind)
                  : PROOFS.filter(x => x.kind === p.kind)).length;
                return (
                <button key={p.tx} onClick={() => setModal({ title: p.label, kind: p.kind })}
                   className="relative p-3 text-left w-full transition-all hover:opacity-90 group cursor-pointer"
                   style={{ background: `${p.accent}06`, border: `1px solid ${p.accent}22`,
                            clipPath: "polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-widest"
                          style={{ color: p.accent }}>
                      {p.kind === "Agent → Agent" ? <Bot size={9} /> : <ShieldCheck size={9} />} {p.kind}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-[9px] group-hover:opacity-75" style={{ color: "#00D4FF" }}>
                      {count} tx <Repeat size={9} />
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-white/80 mt-1.5">{p.label}</p>
                  {p.from !== "agent" && (
                    <div className="flex items-center gap-1.5 mt-1.5 font-mono text-[9px] text-cyber-muted">
                      <span style={{ color: "#00D4FF" }}>{p.from}</span>
                      <ArrowUpRight size={9} style={{ color: p.accent }} />
                      <span style={{ color: ACCENT }}>{p.to}</span>
                    </div>
                  )}
                  <span className="mt-1.5 block font-mono text-[8px] text-cyber-muted/70">click to view history →</span>
                </button>
              ); })}

              {/* Token — opens the full settlement history (all X402 transfers) */}
              <button onClick={() => setModal({ title: "CEP-18 X402 token — all settlements", kind: null })}
                 className="flex items-center justify-between p-2.5 w-full font-mono text-[9px] transition-all hover:opacity-90 cursor-pointer"
                 style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)",
                          clipPath: "polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)" }}>
                <span className="flex items-center gap-1.5 text-cyber-muted"><Coins size={10} style={{ color: ACCENT }} /> CEP-18 X402 token</span>
                <span className="flex items-center gap-1" style={{ color: "#00D4FF" }}>{TOKEN_PKG.slice(0, 10)}… <Repeat size={9} /></span>
              </button>
            </div>

            <div className="mt-auto pt-3 text-[9px] font-mono" style={{ borderTop: "1px solid rgba(0,245,255,0.15)", color: "rgba(255,255,255,0.45)" }}>
              Provider endpoints are mainnet-configured; real CEP-18 settlement is demonstrated on
              Casper <span style={{ color: "#00F5FF" }}>testnet</span> (where the X402 token lives).
              Reproduce: <code style={{ color: "#00F5FF" }}>scripts/fund_buyer.py → scripts/buyer_pays_agent.py</code>.
            </div>
          </div>
        </Card>
      </div>

      {/* ── Settlement history modal ─────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(3px)" }}
             onClick={() => setModal(null)}>
          <div className="relative w-full max-w-lg" style={{ maxHeight: "80vh" }}
               onClick={e => e.stopPropagation()}>
            <Card accent="#00F5FF">
              <div className="p-5 flex flex-col" style={{ maxHeight: "80vh" }}>
                <div className="flex items-center gap-2 mb-1">
                  <Bot size={13} style={{ color: "#00F5FF" }} />
                  <span className="font-mono font-bold uppercase tracking-[0.15em] text-[11px]" style={{ color: "#00F5FF" }}>
                    {modal.title}
                  </span>
                  <button onClick={() => setModal(null)} className="ml-auto hover:opacity-70" title="Close">
                    <XIcon size={16} style={{ color: "#00F5FF" }} />
                  </button>
                </div>
                <p className="text-[9px] font-mono text-cyber-muted mb-3">
                  {modalRows.length} settlement{modalRows.length === 1 ? "" : "s"} · click any tx to open it on testnet.cspr.live
                </p>
                <div className="flex flex-col gap-2 overflow-y-auto pr-1"
                     style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(0,245,255,0.3) transparent" }}>
                  {modalRows.length === 0 && (
                    <p className="text-[10px] font-mono text-cyber-muted py-4 text-center">No settlements yet.</p>
                  )}
                  {modalRows.map(s => (
                    <a key={s.tx_hash} href={s.explorer_url || `${TESTNET}/transaction/${s.tx_hash}`}
                       target="_blank" rel="noreferrer"
                       className="relative p-3 transition-all hover:opacity-90 group"
                       style={{ background: "rgba(0,245,255,0.06)", border: "1px solid rgba(0,245,255,0.22)",
                                clipPath: "polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-widest" style={{ color: "#00F5FF" }}>
                          {s.kind === "Agent → Agent" ? <Bot size={9} /> : <ShieldCheck size={9} />} {s.kind}
                        </span>
                        <span className="flex items-center gap-1 font-mono text-[9px] group-hover:opacity-75" style={{ color: "#00D4FF" }}>
                          {s.tx_hash.slice(0, 12)}… <ExternalLink size={9} />
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-white/80 mt-1.5">{s.label}</p>
                      <div className="flex items-center justify-between mt-1.5 font-mono text-[9px] text-cyber-muted">
                        {s.from && s.from !== "agent" ? (
                          <span className="flex items-center gap-1.5">
                            <span style={{ color: "#00D4FF" }}>{s.from}</span>
                            <ArrowUpRight size={9} style={{ color: "#00F5FF" }} />
                            <span style={{ color: ACCENT }}>{s.to}</span>
                          </span>
                        ) : <span />}
                        {s.ts && <span className="text-cyber-muted/60">{new Date(s.ts).toLocaleString()}</span>}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
