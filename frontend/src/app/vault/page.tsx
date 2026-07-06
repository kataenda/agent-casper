"use client";

/**
 * /vault — My Vaults: agent-wide AUM, every wallet's own vault (highlighted when
 * it's yours), per-vault CSPR assets + allocation, and the live staking + swap
 * history. Everything is on-chain-derived (aum/state/staking-history/defi history).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft, Landmark, Coins, Layers, Wallet, ExternalLink, RefreshCw,
  TrendingUp, Repeat, ShieldCheck, Zap, Cpu,
} from "lucide-react";
import { useWalletVault } from "@/lib/walletVault";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ACCENT = "#00D4FF";
const CLIP = "polygon(16px 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%,0 16px)";
const TESTNET = "https://testnet.cspr.live";
const C = { cons: "#00E28A", bal: "#00C2FF", aggr: "#B57BFF" };

const WalletWidget = dynamic(
  () => import("@/components/WalletWidget").then((m) => ({ default: m.WalletWidget })),
  { ssr: false, loading: () => <span className="font-mono text-[10px] text-white/40">wallet…</span> },
);

interface AumVault { package_hash: string; is_primary: boolean; tvl_cspr: number }
interface Aum { total_cspr: number; vault_count: number; vaults: AumVault[] }
interface Alloc { conservative_pct: number; balanced_pct: number; aggressive_pct: number; strategy: string }
interface VaultState {
  package_hash: string; explorer_url: string; tvl_cspr: number; allocation: Alloc;
  is_primary: boolean; owner_public_key: string;
  last_agent_action?: { action?: string; tx_hash?: string; ts?: string } | null;
}
interface StakeEntry { action: string; amount_cspr?: number; tx_hash: string; validator?: string; ts?: string; package?: string }
interface Swap { tx_hash: string; amount: string; token_in: string; token_out: string; explorer_url?: string; executed: boolean; settlement?: string; ts?: string; triggered_by?: string }

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const short = (h: string, n = 10) => (h || "").replace(/^(hash-|account-hash-)/, "").slice(0, n);

// ── Allocation donut (SVG) ─────────────────────────────────────────────────
function AllocationRing({ a, size = 104 }: { a: Alloc; size?: number }) {
  const stroke = 11, r = size / 2 - stroke, circ = 2 * Math.PI * r;
  const segs = [
    { pct: a.conservative_pct, color: C.cons },
    { pct: a.balanced_pct, color: C.bal },
    { pct: a.aggressive_pct, color: C.aggr },
  ];
  let acc = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        {segs.map((s, i) => {
          const len = (s.pct / 100) * circ;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color}
              strokeWidth={stroke} strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-acc}
              style={{ filter: `drop-shadow(0 0 3px ${s.color}66)` }} />
          );
          acc += len; return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-cyber-muted">strategy</span>
        <span className="font-mono font-bold text-[11px] text-white leading-tight">{a.strategy}</span>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, accent = ACCENT }: {
  icon: React.ElementType; label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="relative p-4 overflow-hidden"
         style={{ background: `linear-gradient(160deg, ${accent}0e, #0a0e14 55%)`, border: `1px solid ${accent}26`, clipPath: CLIP }}>
      <div className="absolute top-0 left-0 h-full w-[3px]" style={{ background: accent, boxShadow: `0 0 12px ${accent}` }} />
      <div className="flex items-center gap-1.5 mb-2 pl-1">
        <Icon size={12} style={{ color: accent }} />
        <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-cyber-muted">{label}</span>
      </div>
      <div className="font-mono font-bold text-[22px] leading-none pl-1" style={{ color: accent }}>{value}</div>
      {sub && <div className="font-mono text-[9px] text-cyber-muted mt-1.5 pl-1">{sub}</div>}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, right, accent = ACCENT }: {
  icon: React.ElementType; title: string; right?: React.ReactNode; accent?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={13} style={{ color: accent }} />
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-white">{title}</span>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${accent}44, transparent)` }} />
      {right}
    </div>
  );
}

export default function VaultPage() {
  const { vaultHash: myVault } = useWalletVault();
  const myPkg = (myVault || "").replace(/^hash-/, "").toLowerCase();

  const [aum, setAum] = useState<Aum | null>(null);
  const [states, setStates] = useState<Record<string, VaultState>>({});
  const [stakes, setStakes] = useState<StakeEntry[]>([]);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const a: Aum = await fetch(`${API}/vault/aum`).then((r) => r.json()).catch(() => null);
      setAum(a);
      if (a?.vaults?.length) {
        const entries = await Promise.all(a.vaults.map(async (v) => {
          try { return [v.package_hash, await fetch(`${API}/vault/state?package=${v.package_hash}`).then((r) => r.json())] as const; }
          catch { return [v.package_hash, null] as const; }
        }));
        setStates(Object.fromEntries(entries.filter(([, s]) => s)) as Record<string, VaultState>);
      }
      setStakes((await fetch(`${API}/vault/staking-history`).then((r) => r.json()).catch(() => ({})))?.history ?? []);
      setSwaps((await fetch(`${API}/defi/history?limit=25`).then((r) => r.json()).catch(() => ({})))?.swaps ?? []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const myState = myPkg ? states[myPkg] : undefined;

  return (
    <div className="min-h-screen px-4 py-5 md:px-8 md:py-7" style={{ maxWidth: 1180, margin: "0 auto" }}>
      {/* Top bar */}
      <header className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-mono text-[10px] uppercase tracking-widest transition-opacity hover:opacity-70"
                style={{ borderColor: "rgba(0,245,255,0.35)", color: "#00F5FF", background: "rgba(0,245,255,0.06)" }}>
            <ArrowLeft size={12} /> Dashboard
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center rounded-lg" style={{ width: 34, height: 34, background: `${ACCENT}12`, border: `1px solid ${ACCENT}33` }}>
              <Landmark size={16} style={{ color: ACCENT }} />
            </div>
            <div>
              <h1 className="font-mono font-bold uppercase tracking-[0.18em] text-sm" style={{ color: ACCENT }}>My Vaults</h1>
              <p className="text-[9px] font-mono text-cyber-muted uppercase tracking-[0.16em]">agent AUM · per-wallet assets · staking &amp; swap history</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 font-mono text-[10px] text-white/50 hover:text-white disabled:opacity-40 uppercase tracking-widest">
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> refresh
          </button>
          <WalletWidget />
        </div>
      </header>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat icon={Coins} label="Total AUM" value={aum ? `${fmt(aum.total_cspr)}` : "…"} sub="CSPR across all vaults" />
        <Stat icon={Layers} label="Vaults" value={aum ? String(aum.vault_count) : "…"} sub="independently owned" accent="#B57BFF" />
        <Stat icon={Wallet} label="My Vault" value={myState ? `${fmt(myState.tvl_cspr)}` : myVault ? "…" : "—"} sub={myVault ? "CSPR · connected wallet" : "connect wallet"} accent="#00E28A" />
        <Stat icon={TrendingUp} label="My Strategy" value={myState?.allocation?.strategy ?? "—"} sub={myState ? `${myState.allocation.conservative_pct} / ${myState.allocation.balanced_pct} / ${myState.allocation.aggressive_pct}` : "—"} accent="#FFB347" />
      </div>

      {/* All vaults */}
      <div className="mb-6">
        <SectionTitle icon={Layers} title="All Vaults" right={<span className="font-mono text-[8px] text-cyber-muted uppercase tracking-widest">assets per wallet</span>} />
        <div className="grid gap-3 lg:grid-cols-2">
          {aum?.vaults?.length ? aum.vaults.map((v) => {
            const s = states[v.package_hash];
            const mine = v.package_hash.toLowerCase() === myPkg;
            const ac = mine ? "#00E28A" : ACCENT;
            return (
              <div key={v.package_hash} className="relative p-5" style={{ background: `linear-gradient(150deg, ${ac}0c, #0a0e14 60%)`, border: `1px solid ${ac}2b`, clipPath: CLIP }}>
                <div className="flex items-start justify-between gap-4">
                  {/* left: identity + assets */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                      {v.is_primary && <span className="font-mono text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider" style={{ background: `${C.cons}18`, border: `1px solid ${C.cons}55`, color: C.cons }}>primary · AI-managed</span>}
                      {mine && <span className="font-mono text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider" style={{ background: "#FFB34718", border: "1px solid #FFB34755", color: "#FFB347" }}>yours</span>}
                    </div>
                    <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-cyber-muted mb-1">Assets custodied on-chain</div>
                    <div className="font-mono font-bold text-[30px] leading-none text-white">
                      {fmt(v.tvl_cspr)}<span className="text-[13px] text-cyber-muted font-normal ml-1.5">CSPR</span>
                    </div>
                    <div className="mt-4 flex flex-col gap-1.5 font-mono text-[9px]">
                      <a href={`${TESTNET}/contract-package/${v.package_hash}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:opacity-75 w-fit" style={{ color: ACCENT }}>
                        <span className="text-cyber-muted">vault</span> {short(v.package_hash, 16)}… <ExternalLink size={8} />
                      </a>
                      {s?.owner_public_key && (
                        <span className="text-cyber-muted flex items-center gap-1"><Wallet size={9} /> owner <span style={{ color: "#8bd4ff" }}>{short(s.owner_public_key, 14)}…</span></span>
                      )}
                      {s?.last_agent_action?.tx_hash && (
                        <a href={`${TESTNET}/deploy/${s.last_agent_action.tx_hash}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:opacity-75 w-fit" style={{ color: C.aggr }}>
                          <Cpu size={9} /> agent {s.last_agent_action.action} <ExternalLink size={8} />
                        </a>
                      )}
                    </div>
                  </div>
                  {/* right: allocation ring + legend */}
                  {s && (
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <AllocationRing a={s.allocation} />
                      <div className="flex flex-col gap-0.5 font-mono text-[8px]">
                        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: C.cons }} /> <span className="text-white/80 w-16">Conservative</span> <span className="text-cyber-muted tabular-nums">{s.allocation.conservative_pct}%</span></span>
                        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: C.bal }} /> <span className="text-white/80 w-16">Balanced</span> <span className="text-cyber-muted tabular-nums">{s.allocation.balanced_pct}%</span></span>
                        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: C.aggr }} /> <span className="text-white/80 w-16">Aggressive</span> <span className="text-cyber-muted tabular-nums">{s.allocation.aggressive_pct}%</span></span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          }) : (
            <div className="p-6 font-mono text-[10px] text-cyber-muted" style={{ border: "1px solid #ffffff12", clipPath: CLIP }}>loading vaults…</div>
          )}
        </div>
      </div>

      {/* Staking + Swap history */}
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {/* Staking history */}
        <div className="p-5" style={{ background: `linear-gradient(150deg, ${C.cons}0a, #0a0e14 60%)`, border: `1px solid ${C.cons}2b`, clipPath: CLIP }}>
          <SectionTitle icon={ShieldCheck} title="Staking History" accent={C.cons}
            right={<span className="font-mono text-[8px] text-cyber-muted uppercase tracking-widest">native delegation · real yield</span>} />
          {stakes.length ? (
            <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
              {stakes.map((e, i) => {
                const mine = (e.package || "").toLowerCase() === myPkg;
                const col = e.action === "stake" ? C.cons : e.action === "unstake" ? "#FFB347" : ACCENT;
                return (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-md font-mono text-[9px]" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <span className="font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: col, background: `${col}14` }}>{e.action}</span>
                    {e.amount_cspr != null && <span className="text-white tabular-nums">{fmt(e.amount_cspr)} CSPR</span>}
                    {mine && <span className="text-[7px] px-1 rounded" style={{ background: "#FFB34714", color: "#FFB347" }}>yours</span>}
                    <a href={`${TESTNET}/deploy/${e.tx_hash}`} target="_blank" rel="noreferrer" className="ml-auto shrink-0 hover:opacity-75 flex items-center gap-1" style={{ color: "#8bd4ff" }}>{short(e.tx_hash, 10)}… <ExternalLink size={8} /></a>
                    {e.ts && <span className="text-cyber-muted text-[8px] tabular-nums">{e.ts.slice(5, 16)}</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 rounded-md" style={{ background: "rgba(255,255,255,0.02)" }}>
              <ShieldCheck size={13} className="mt-0.5 shrink-0" style={{ color: `${C.cons}88` }} />
              <p className="font-mono text-[9px] text-cyber-muted leading-relaxed">No staking yet — the agent delegates to a validator when its allocation decision favors the safe-yield bucket. Every stake/unstake lands here, on-chain.</p>
            </div>
          )}
        </div>

        {/* Swap history */}
        <div className="p-5" style={{ background: "linear-gradient(150deg, #FF4D6D0a, #0a0e14 60%)", border: "1px solid #FF4D6D2b", clipPath: CLIP }}>
          <SectionTitle icon={Repeat} title="Swap History" accent="#FF4D6D"
            right={<span className="font-mono text-[8px] text-cyber-muted uppercase tracking-widest">CSPR.trade · mainnet</span>} />
          {swaps.length ? (
            <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
              {swaps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-md font-mono text-[9px]" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <span className="text-white shrink-0 tabular-nums">{s.amount} {s.token_in}<span className="text-cyber-muted"> → </span><span style={{ color: "#8bd4ff" }}>{s.token_out}</span></span>
                  {s.executed ? <span className="text-[7px] px-1.5 py-0.5 rounded uppercase" style={{ background: `${C.cons}18`, color: C.cons }}>executed</span> : <span className="text-[7px] px-1.5 py-0.5 rounded uppercase" style={{ background: "#FFB34718", color: "#FFB347" }}>{s.settlement || "built"}</span>}
                  <a href={s.explorer_url || `https://cspr.live/transaction/${s.tx_hash}`} target="_blank" rel="noreferrer" className="ml-auto shrink-0 hover:opacity-75 flex items-center gap-1" style={{ color: "#8bd4ff" }}>{short(s.tx_hash, 10)}… <ExternalLink size={8} /></a>
                  {s.ts && <span className="text-cyber-muted text-[8px] tabular-nums">{s.ts.slice(5, 16)}</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 rounded-md" style={{ background: "rgba(255,255,255,0.02)" }}>
              <Repeat size={13} className="mt-0.5 shrink-0" style={{ color: "#FF4D6D88" }} />
              <p className="font-mono text-[9px] text-cyber-muted leading-relaxed">No swaps yet — the agent rotates into the most profitable token only when a rebalance clears the economic gate (gain above gas + slippage).</p>
            </div>
          )}
        </div>
      </div>

      <p className="font-mono text-[8px] text-cyber-muted/55 mt-6 mb-10 leading-relaxed">
        AUM, per-vault assets, allocation, staking and swaps are all reconstructed from on-chain deploys — no self-reported numbers.
        Connect your wallet to highlight your own vault. Per-tenant isolated dashboards (own keys + scoped auth) are Phase 3.
      </p>
    </div>
  );
}
