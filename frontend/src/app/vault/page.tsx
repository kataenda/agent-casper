"use client";

/**
 * /vault — My Vaults: agent-wide AUM, every wallet's own vault (highlighted when
 * it's yours), per-vault CSPR assets + allocation, and the live staking + swap
 * history. Data is all on-chain-derived (aum/state/staking-history/defi history).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft, Landmark, Coins, Layers, Wallet, ExternalLink, RefreshCw,
  TrendingUp, Repeat, ShieldCheck, Zap,
} from "lucide-react";
import { useWalletVault } from "@/lib/walletVault";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ACCENT = "#00D4FF";
const CLIP = "polygon(14px 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%,0 14px)";
const TESTNET = "https://testnet.cspr.live";

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
interface Swap { tx_hash: string; amount: string; token_in: string; token_out: string; explorer_url?: string; executed: boolean; settlement?: string; ts?: string; triggered_by?: string; direction_reason?: string }

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const short = (h: string, n = 10) => (h || "").replace(/^(hash-|account-hash-)/, "").slice(0, n);

function Panel({ children, accent = ACCENT }: { children: React.ReactNode; accent?: string }) {
  return <div className="p-4 md:p-5" style={{ background: "#0A0E14", border: `1px solid ${accent}22`, clipPath: CLIP }}>{children}</div>;
}

function Stat({ icon: Icon, label, value, sub, accent = ACCENT }: {
  icon: React.ElementType; label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="p-3" style={{ background: "#0A0E14", border: `1px solid ${accent}22`, clipPath: CLIP }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={12} style={{ color: accent }} />
        <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-cyber-muted">{label}</span>
      </div>
      <div className="font-mono font-bold text-lg" style={{ color: accent }}>{value}</div>
      {sub && <div className="font-mono text-[9px] text-cyber-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function AllocBar({ a }: { a: Alloc }) {
  const seg = [
    { pct: a.conservative_pct, c: "#00FF94" },
    { pct: a.balanced_pct, c: "#00F5FF" },
    { pct: a.aggressive_pct, c: "#BF5AF2" },
  ];
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#ffffff10" }}>
      {seg.map((s, i) => <div key={i} style={{ width: `${s.pct}%`, background: s.c }} />)}
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
    <div className="min-h-screen px-4 py-4 md:px-8 md:py-6" style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Top bar */}
      <header className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-mono text-[10px] uppercase tracking-widest transition-opacity hover:opacity-70"
                style={{ borderColor: "rgba(0,245,255,0.35)", color: "#00F5FF", background: "rgba(0,245,255,0.06)" }}>
            <ArrowLeft size={12} /> Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <Landmark size={18} style={{ color: ACCENT, filter: `drop-shadow(0 0 8px ${ACCENT})` }} />
            <div>
              <h1 className="font-mono font-bold uppercase tracking-[0.15em] text-sm" style={{ color: ACCENT }}>My Vaults · Agent AUM</h1>
              <p className="text-[9px] font-mono text-cyber-muted uppercase tracking-[0.15em]">every wallet's vault · assets · staking &amp; swap history</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-1 font-mono text-[10px] text-white/50 hover:text-white disabled:opacity-40">
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> refresh
          </button>
          <WalletWidget />
        </div>
      </header>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat icon={Coins} label="Total AUM" value={aum ? `${fmt(aum.total_cspr)} CSPR` : "…"} sub="across all vaults" />
        <Stat icon={Layers} label="Vaults" value={aum ? String(aum.vault_count) : "…"} sub="independently owned" accent="#BF5AF2" />
        <Stat icon={Wallet} label="My Vault" value={myState ? `${fmt(myState.tvl_cspr)} CSPR` : myVault ? "…" : "—"} sub={myVault ? "connected wallet" : "connect wallet"} accent="#00FF94" />
        <Stat icon={TrendingUp} label="My Strategy" value={myState?.allocation?.strategy ?? "—"} sub={myState ? `${myState.allocation.conservative_pct}/${myState.allocation.balanced_pct}/${myState.allocation.aggressive_pct}` : ""} accent="#FFB347" />
      </div>

      {/* All vaults */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <Layers size={13} style={{ color: ACCENT }} />
          <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-white">All Vaults</span>
          <span className="font-mono text-[9px] text-cyber-muted">— total per wallet</span>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {aum?.vaults?.length ? aum.vaults.map((v) => {
            const s = states[v.package_hash];
            const mine = v.package_hash.toLowerCase() === myPkg;
            return (
              <Panel key={v.package_hash} accent={mine ? "#00FF94" : ACCENT}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {v.is_primary && <span className="font-mono text-[8px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: "#00FF9414", border: "1px solid #00FF9444", color: "#00FF94" }}>primary · AI-managed</span>}
                  {mine && <span className="font-mono text-[8px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: "#FFB34714", border: "1px solid #FFB34744", color: "#FFB347" }}>yours</span>}
                  <a href={`${TESTNET}/contract-package/${v.package_hash}`} target="_blank" rel="noreferrer" className="font-mono text-[10px] hover:opacity-75 flex items-center gap-1" style={{ color: ACCENT }}>
                    {short(v.package_hash, 16)}… <ExternalLink size={9} />
                  </a>
                </div>
                <div className="flex items-end justify-between gap-3 mb-2">
                  <div>
                    <div className="font-mono text-[8px] uppercase tracking-widest text-cyber-muted">Assets (CSPR custodied)</div>
                    <div className="font-mono font-bold text-lg text-white">{fmt(v.tvl_cspr)} <span className="text-[11px] text-cyber-muted">CSPR</span></div>
                  </div>
                  {s && <div className="text-right font-mono text-[9px] text-cyber-muted">owner<br /><span style={{ color: "#00D4FF" }}>{short(s.owner_public_key, 12)}…</span></div>}
                </div>
                {s && (<><AllocBar a={s.allocation} />
                  <div className="flex items-center justify-between mt-1.5 font-mono text-[8px] text-cyber-muted">
                    <span><span style={{ color: "#00FF94" }}>●</span> {s.allocation.conservative_pct}% cons · <span style={{ color: "#00F5FF" }}>●</span> {s.allocation.balanced_pct}% bal · <span style={{ color: "#BF5AF2" }}>●</span> {s.allocation.aggressive_pct}% aggr</span>
                    {s.last_agent_action?.tx_hash && <a href={`${TESTNET}/deploy/${s.last_agent_action.tx_hash}`} target="_blank" rel="noreferrer" className="hover:opacity-75" style={{ color: "#BF5AF2" }}><Zap size={8} className="inline" /> {s.last_agent_action.action}</a>}
                  </div></>)}
              </Panel>
            );
          }) : <p className="font-mono text-[10px] text-cyber-muted">loading vaults…</p>}
        </div>
      </div>

      {/* Staking + Swap history */}
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {/* Staking history */}
        <Panel accent="#00FF94">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={13} style={{ color: "#00FF94" }} />
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-white">Staking History</span>
            <span className="font-mono text-[8px] text-cyber-muted ml-auto">native delegation · real yield</span>
          </div>
          {stakes.length ? (
            <div className="flex flex-col gap-1 max-h-[320px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              {stakes.map((e, i) => {
                const mine = (e.package || "").toLowerCase() === myPkg;
                return (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded font-mono text-[9px]" style={{ background: "#00FF9407", border: "1px solid #00FF941a" }}>
                    <span className="font-bold uppercase w-20 shrink-0" style={{ color: e.action === "stake" ? "#00FF94" : e.action === "unstake" ? "#FFB347" : "#00D4FF" }}>{e.action}</span>
                    {e.amount_cspr != null && <span className="text-white">{fmt(e.amount_cspr)} CSPR</span>}
                    {mine && <span className="text-[7px] px-1 rounded" style={{ background: "#FFB34714", color: "#FFB347" }}>yours</span>}
                    <a href={`${TESTNET}/deploy/${e.tx_hash}`} target="_blank" rel="noreferrer" className="ml-auto shrink-0 hover:opacity-75" style={{ color: "#00D4FF" }}>{short(e.tx_hash, 10)}… <ExternalLink size={8} className="inline" /></a>
                    {e.ts && <span className="text-cyber-muted text-[8px]">{e.ts.slice(5, 16)}</span>}
                  </div>
                );
              })}
            </div>
          ) : <p className="font-mono text-[10px] text-cyber-muted">No staking yet — the agent delegates when its allocation decision favors the safe-yield bucket. Entries appear here on-chain.</p>}
        </Panel>

        {/* Swap history */}
        <Panel accent="#FF4D6D">
          <div className="flex items-center gap-2 mb-3">
            <Repeat size={13} style={{ color: "#FF4D6D" }} />
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-white">Swap History</span>
            <span className="font-mono text-[8px] text-cyber-muted ml-auto">CSPR.trade · mainnet</span>
          </div>
          {swaps.length ? (
            <div className="flex flex-col gap-1 max-h-[320px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              {swaps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded font-mono text-[9px]" style={{ background: "#FF4D6D07", border: "1px solid #FF4D6D1a" }}>
                  <span className="text-white shrink-0">{s.amount} {s.token_in}<span className="text-cyber-muted"> → </span>{s.token_out}</span>
                  {s.executed ? <span className="text-[7px] px-1 rounded" style={{ background: "#00FF9414", color: "#00FF94" }}>executed</span> : <span className="text-[7px] px-1 rounded" style={{ background: "#FFB34714", color: "#FFB347" }}>{s.settlement || "built"}</span>}
                  <a href={s.explorer_url || `https://cspr.live/transaction/${s.tx_hash}`} target="_blank" rel="noreferrer" className="ml-auto shrink-0 hover:opacity-75" style={{ color: "#00D4FF" }}>{short(s.tx_hash, 10)}… <ExternalLink size={8} className="inline" /></a>
                  {s.ts && <span className="text-cyber-muted text-[8px]">{s.ts.slice(5, 16)}</span>}
                </div>
              ))}
            </div>
          ) : <p className="font-mono text-[10px] text-cyber-muted">No swaps yet — the agent swaps into the most profitable token when a rebalance is economically worth it.</p>}
        </Panel>
      </div>

      <p className="font-mono text-[8px] text-cyber-muted/60 mt-5 mb-10">
        AUM, per-vault assets, staking and swaps are all reconstructed from on-chain deploys — no self-reported numbers.
        Connect your wallet to highlight your own vault. Per-tenant isolated dashboards are Phase 3.
      </p>
    </div>
  );
}
