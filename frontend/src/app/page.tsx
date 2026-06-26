"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { TrendingUp, RefreshCw, Activity, Zap, AlertTriangle, Wallet, ArrowDownCircle } from "lucide-react";
import Image from "next/image";

const WalletWidget = dynamic(
  () => import("@/components/WalletWidget").then((m) => ({ default: m.WalletWidget })),
  { ssr: false }
);
const DeployPanel = dynamic(
  () => import("@/components/DeployPanel").then((m) => ({ default: m.DeployPanel })),
  { ssr: false }
);
const RegisterAgentButton = dynamic(
  () => import("@/components/VaultControls").then((m) => ({ default: m.RegisterAgentButton })),
  { ssr: false }
);
const DepositButton = dynamic(
  () => import("@/components/VaultControls").then((m) => ({ default: m.DepositButton })),
  { ssr: false }
);
const AgentControls = dynamic(
  () => import("@/components/AgentControls").then((m) => ({ default: m.AgentControls })),
  { ssr: false }
);
const ChatBox = dynamic(
  () => import("@/components/ChatBox").then((m) => ({ default: m.ChatBox })),
  { ssr: false }
);
const X402Services = dynamic(
  () => import("@/components/X402Services").then((m) => ({ default: m.X402Services })),
  { ssr: false }
);
const DefiSwap = dynamic(
  () => import("@/components/DefiSwap").then((m) => ({ default: m.DefiSwap })),
  { ssr: false }
);

import { useAgentStore } from "@/lib/store";
import { useWalletStore } from "@/lib/walletStore";
import { useAgentWebSocket } from "@/lib/useWebSocket";
import { StatusBadge } from "@/components/StatusBadge";
import { PortfolioChart } from "@/components/PortfolioChart";
import { AllocationDonut } from "@/components/AllocationDonut";
import { DecisionLog } from "@/components/DecisionLog";
import { YieldRatesPanel } from "@/components/YieldRatesPanel";
import { RWAPanel } from "@/components/RWAPanel";
import { DefiProofCard } from "@/components/DefiProofCard";

const CUT = 12;   // px — diagonal corner cut size
const BRD = 1.5;  // px — border thickness (semua sisi)

// Outer clip: full chamfered octagon
const CLIP_OUTER = `polygon(
  ${CUT}px 0%, calc(100% - ${CUT}px) 0%,
  100% ${CUT}px, 100% calc(100% - ${CUT}px),
  calc(100% - ${CUT}px) 100%, ${CUT}px 100%,
  0% calc(100% - ${CUT}px), 0% ${CUT}px
)`;

// Inner clip: uniform BRD on all sides
const CLIP_INNER = `polygon(
  ${CUT}px ${BRD}px, calc(100% - ${CUT}px) ${BRD}px,
  calc(100% - ${BRD}px) ${CUT}px, calc(100% - ${BRD}px) calc(100% - ${CUT}px),
  calc(100% - ${CUT}px) calc(100% - ${BRD}px), ${CUT}px calc(100% - ${BRD}px),
  ${BRD}px calc(100% - ${CUT}px), ${BRD}px ${CUT}px
)`;

/* ── Panel wrapper — cyberpunk chamfered border ────────────────── */
function Panel({ children, className = "", style, accent = "#00F5FF" }: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  accent?: string;
}) {
  return (
    /* Outer: accent color fills chamfer shape → becomes the visible border */
    <div style={{
      clipPath: CLIP_OUTER,
      background: accent,
      filter: `drop-shadow(0 0 18px ${accent}) drop-shadow(0 0 6px ${accent}ee) drop-shadow(0 0 40px ${accent}66)`,
      ...style,
    }}>
      {/* Inner: dark glass with atmosphere */}
      <div
        className={`relative overflow-hidden p-3 ${className}`}
        style={{
          background: "rgba(2, 2, 6, 0.98)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          clipPath: CLIP_INNER,
          height: "100%",
          minHeight: 0,
        }}
      >
        {/* Atmospheric top glow — accent color radiates down from top edge */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
          background: `radial-gradient(ellipse 90% 50% at 50% 0%, ${accent}10 0%, transparent 65%)`,
        }} />
        {/* Subtle inner grid */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 0.4,
          backgroundImage: `linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)`,
          backgroundSize: "22px 22px",
        }} />
        {/* Top highlight bar */}
        <div style={{
          position: "absolute", top: 0, left: "8%", right: "8%", height: 2, zIndex: 1, pointerEvents: "none",
          background: `linear-gradient(90deg, transparent, ${accent}cc, ${accent}, ${accent}cc, transparent)`,
          boxShadow: `0 0 14px 3px ${accent}88, 0 0 4px ${accent}`,
        }} />
        {/* Corner tab kiri atas */}
        <div style={{ position: "absolute", top: -BRD, left: CUT - 2, zIndex: 2, pointerEvents: "none" }}>
          <div style={{ width: 2, height: 8, background: accent, boxShadow: `0 0 6px ${accent}` }} />
        </div>
        {/* Corner tab kanan atas */}
        <div style={{ position: "absolute", top: -BRD, right: CUT - 2, zIndex: 2, pointerEvents: "none" }}>
          <div style={{ width: 2, height: 8, background: accent, boxShadow: `0 0 6px ${accent}` }} />
        </div>
        {/* Bottom vignette */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: "35%",
          background: "linear-gradient(0deg, rgba(0,0,0,0.35) 0%, transparent 100%)",
          pointerEvents: "none", zIndex: 0,
        }} />
        {/* Content sits above overlays */}
        <div className="relative flex flex-col h-full min-h-0" style={{ zIndex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Panel label ───────────────────────────────────────────────── */
function PanelLabel({ text, accent = "#00F5FF" }: { text: string; accent?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5 shrink-0">
      {/* Blinking status dot */}
      <span style={{
        width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
        backgroundColor: accent,
        boxShadow: `0 0 6px ${accent}`,
        animation: "pulse 2s ease-in-out infinite",
      }} />
      <span className="font-mono font-bold uppercase tracking-[0.18em] text-[9px]"
            style={{ color: accent }}>
        {text}
      </span>
      <div className="flex-1 h-px" style={{
        background: `linear-gradient(90deg, ${accent}50, ${accent}10, transparent)`,
      }} />
    </div>
  );
}

/* ── Stat card ─────────────────────────────────────────────────── */
function StatCard({
  icon: Icon, label, value, sub, accent = "#00F5FF",
}: {
  icon: React.ElementType; label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="relative overflow-hidden transition-all duration-500 group cursor-default h-full"
         style={{
           background: `linear-gradient(135deg, rgba(0,0,3,0.99) 0%, ${accent}08 100%)`,
           border: `1px solid ${accent}35`,
           clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))",
           boxShadow: `0 0 0 1px ${accent}15, 0 4px 30px rgba(0,0,0,0.7), inset 0 1px 0 ${accent}25`,
         }}>
      {/* Animated left bar */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
        background: `linear-gradient(180deg, transparent 0%, ${accent} 30%, ${accent} 70%, transparent 100%)`,
        boxShadow: `0 0 12px 2px ${accent}cc, 0 0 24px ${accent}66`,
        animation: "pulse 2.5s ease-in-out infinite",
      }} />
      {/* Top-right chamfer fill */}
      <div style={{
        position: "absolute", top: 0, right: 0, width: 32, height: 32,
        background: `linear-gradient(225deg, ${accent}40 0%, transparent 65%)`,
      }} />
      {/* Inner top glow */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "60%",
        background: `radial-gradient(ellipse 80% 60% at 40% 0%, ${accent}10 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />
      {/* Hover radial glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
           style={{ background: `radial-gradient(ellipse at 40% 60%, ${accent}12 0%, transparent 65%)` }} />

      <div className="px-4 py-3 pl-6">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-mono uppercase tracking-[0.25em] text-[8px]"
                style={{ color: `${accent}70` }}>{label}</span>
          <Icon size={11} style={{ color: accent, opacity: 0.4 }} />
        </div>
        <div className="font-mono font-black cyber-num leading-none"
             style={{
               fontSize: 24, color: accent,
               textShadow: `0 0 10px ${accent}, 0 0 25px ${accent}cc, 0 0 50px ${accent}66, 0 0 80px ${accent}33`,
             }}>
          {value}
        </div>
        {sub && (
          <div className="font-mono uppercase tracking-widest truncate mt-2 text-[8px]"
               style={{ color: `${accent}50` }}>
            {sub}
          </div>
        )}
      </div>
      {/* Bottom glowing line */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent 0%, ${accent}80 25%, ${accent} 50%, ${accent}80 75%, transparent 100%)`,
        boxShadow: `0 0 12px 2px ${accent}99, 0 -2px 20px ${accent}44`,
      }} />
    </div>
  );
}

const CONTRACT_HASH = "hash-f6ba9dfa2a236dcc253436c3350f06931465ca94290fad689dfc7c9058c559da";

/* ── Main page ─────────────────────────────────────────────────── */
export default function DashboardPage() {
  useAgentWebSocket();

  const { connected, latestCycle, cycles, depositedMotes, vaultTxs } = useAgentStore();
  const { agentRegistered } = useWalletStore();

  const [agentInfo, setAgentInfo] = useState<{ account_hash: string; balance_cspr: number } | null>(null);
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/admin/agent-address`)
      .then(r => r.json())
      .then(d => setAgentInfo({
        account_hash: d.agent_account_hash ?? "",
        balance_cspr: d.balance_cspr ?? 0,
      }))
      .catch(() => {});
  }, [latestCycle?.block_height]);

  const portfolio   = latestCycle?.portfolio;
  const decision    = latestCycle?.decision;
  const hasContract = !!latestCycle;
  const effectiveMotes = (portfolio?.total_value_motes ?? 0) + depositedMotes;
  const totalCspr   = hasContract && effectiveMotes > 0
    ? (effectiveMotes / 1e9).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : hasContract ? "0"
    : "—";
  // Build display portfolio: use effective motes + AI allocation when on-chain is 0
  const displayPortfolio = portfolio ? {
    ...portfolio,
    total_value_motes: effectiveMotes,
    conservative_pct: (portfolio.conservative_pct || decision?.conservative_pct || 40),
    balanced_pct:     (portfolio.balanced_pct     || decision?.balanced_pct     || 50),
    aggressive_pct:   (portfolio.aggressive_pct   || decision?.aggressive_pct   || 10),
  } : undefined;
  const rebalances  = cycles.filter(c => c.decision.action === "REBALANCE").length;
  const latestRebalanceTx = cycles.find(c => c.decision.action === "REBALANCE" && c.tx_hash)?.tx_hash
    ?? "dd0c391f1d69d5fe55a3b72fd6fd1d617a354812c80de67b9d12ddc9233ec29e";
  const lastAction  = decision?.action ?? "—";
  const confidence  = decision && decision.confidence > 0 ? `${(decision.confidence * 100).toFixed(0)}%` : "—";
  const blockHeight = latestCycle?.block_height ? `#${latestCycle.block_height.toLocaleString()}` : "—";
  const actionAccent =
    lastAction === "REBALANCE" ? "#00F5FF" : lastAction === "ALERT" ? "#FF2D55" : "#FFFFFF";

  const HUD_C = "rgba(0,245,255,0.35)";

  return (
    /* Full viewport — no scroll */
    <div className="h-screen overflow-hidden flex flex-col px-3 py-2 md:px-5 md:py-3"
         style={{ maxWidth: 1700, margin: "0 auto" }}>

      {/* ── HUD screen corners ──────────────────────────────────── */}
      {[
        { top: 6, left: 6, bTop: true, bLeft: true },
        { top: 6, right: 6, bTop: true, bRight: true },
        { bottom: 6, left: 6, bBottom: true, bLeft: true },
        { bottom: 6, right: 6, bBottom: true, bRight: true },
      ].map((pos, i) => (
        <div key={i} style={{
          position: "fixed", zIndex: 50, width: 20, height: 20, pointerEvents: "none",
          top: pos.top, left: pos.left, right: (pos as any).right, bottom: (pos as any).bottom,
          borderTop:    (pos as any).bTop    ? `2px solid ${HUD_C}` : undefined,
          borderBottom: (pos as any).bBottom ? `2px solid ${HUD_C}` : undefined,
          borderLeft:   (pos as any).bLeft   ? `2px solid ${HUD_C}` : undefined,
          borderRight:  (pos as any).bRight  ? `2px solid ${HUD_C}` : undefined,
        }} />
      ))}

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between shrink-0 mb-2">
        <div className="flex items-center gap-3">
          <Image
            src="/agent_casper.png"
            alt="AGENT-CASPER"
            width={56}
            height={56}
            className="shrink-0 object-contain"
            style={{ filter: "drop-shadow(0 0 10px rgba(0,245,255,0.65))" }}
            priority
          />
          <div>
            <h1 className="text-base font-bold tracking-tight leading-none"
                style={{ fontFamily: "var(--font-space-grotesk)" }}>
              <span style={{ color: "#00F5FF" }}>AGENT</span>
              <span className="text-white">-CASPER</span>
            </h1>
            <p className="text-[9px] font-mono text-cyber-muted uppercase tracking-[0.15em] mt-0.5">
              Autonomous DeFi Agent&nbsp;//&nbsp;Casper Network
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <AgentControls isRegistered={agentRegistered} />
          <WalletWidget />
          <DefiSwap />
          <X402Services />
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/docs`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded border font-mono text-[9px] uppercase tracking-widest transition-opacity hover:opacity-70"
            style={{ borderColor: "rgba(191,90,242,0.35)", color: "#BF5AF2", background: "rgba(191,90,242,0.07)" }}
          >
            API
          </a>
          <StatusBadge connected={connected} />
        </div>
      </header>

      {/* ── Header separator — gradient glow line ──────────────── */}
      <div className="shrink-0 mb-2" style={{ height: 2, position: "relative" }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(90deg, transparent 0%, #00F5FF 20%, #00F5FF 35%, #BF5AF2 55%, #00FF94 80%, transparent 100%)",
          boxShadow: "0 0 18px 2px rgba(0,245,255,0.5), 0 0 40px rgba(191,90,242,0.3), 0 0 60px rgba(0,255,148,0.15)",
          opacity: 0.85,
        }} />
      </div>

      {/* ── Stat cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0 mb-2"
           style={{ gridAutoRows: "88px" }}>
        <StatCard icon={TrendingUp} label="Portfolio Value"
          value={hasContract ? `${totalCspr} CSPR` : "—"}
          sub={hasContract ? `Strategy: ${portfolio?.current_strategy ?? "HOLDING"}` : "Deploy contract first"}
          accent="#00F5FF" />
        <StatCard icon={RefreshCw} label="Rebalances"
          value={String(rebalances)} sub={`of ${cycles.length} cycles`} accent="#BF5AF2" />
        <StatCard icon={Activity}  label="AI Decision"
          value={lastAction} sub={`Confidence: ${confidence}`} accent={actionAccent} />
        <StatCard icon={Zap} label="Block Height"
          value={blockHeight} sub="Casper Testnet" accent="#00FF94" />
      </div>

      {/* ── Main content — grid areas sesuai wireframe ──────────── */}
      {/*
        ┌──────────┬──────────────────┬──────────────┬──────────┐
        │          │  Portfolio       │  Allocation  │          │
        │  RWA     │  Trajectory      │  Matrix      │  Yield   │
        │  Oracle  ├──────────────────┴──────────────┤  Intel   │
        │  (full)  │  Neural Decision Log             │  (full)  │
        └──────────┴──────────────────────────────────┴──────────┘
      */}
      {/*
        Col: 1=RWA  2=Portfolio  3=Allocation  4=Log
        Row1: RWA | Portfolio  | Allocation | Log
        Row2: RWA | Yield (span col2-3)      | Log
      */}
      <div className="flex-1 min-h-0 gap-2" style={{
        display: "grid",
        gridTemplateColumns: "1fr 2fr 1.5fr 1fr",
        gridTemplateRows: "minmax(0,0.7fr) minmax(0,1.15fr) minmax(0,0.75fr)",
      }}>

        {/* RWA Oracle — col 1, rows 1–2 */}
        <Panel accent="#FF9F0A" className="flex flex-col overflow-hidden" style={{ gridColumn: "1", gridRow: "1 / 3" }}>
          <PanelLabel text="RWA Oracle — Real-World Assets" accent="#FF9F0A" />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <RWAPanel />
          </div>
        </Panel>

        {/* Vault Actions — col 1, row 3 */}
        <Panel accent="#00D4FF" className="flex flex-col justify-between overflow-hidden" style={{ gridColumn: "1", gridRow: "3" }}>
          <PanelLabel text="Vault Actions" accent="#00D4FF" />

          {/* Agent wallet info */}
          <div className="rounded px-3 py-2 flex items-center justify-between gap-2"
               style={{ background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.15)" }}>
            <div className="flex items-center gap-1.5 min-w-0">
              <Wallet size={9} style={{ color: "#00D4FF" }} />
              {agentInfo?.account_hash ? (
                <a
                  href={`https://testnet.cspr.live/account/${agentInfo.account_hash.replace("account-hash-", "")}`}
                  target="_blank" rel="noopener noreferrer"
                  className="font-mono text-[10px] hover:opacity-75 truncate"
                  style={{ color: "#00D4FF" }}
                  title={agentInfo.account_hash}
                >
                  {agentInfo.account_hash.replace("account-hash-", "").slice(0, 10)}… ↗
                </a>
              ) : (
                <span className="text-[10px] font-mono text-cyber-muted animate-pulse">loading…</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono shrink-0">
              <span className="text-cyber-muted">TVL</span>
              <span style={{ color: "#00FF94" }} className="font-bold">
                {(effectiveMotes / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 })} CSPR
              </span>
            </div>
          </div>

          {/* Deposit row */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest" style={{ color: "rgba(0,212,255,0.5)" }}>
              <ArrowDownCircle size={9} style={{ color: "#00D4FF" }} /> Deposit to Vault
            </div>
            <DepositButton contractHash={CONTRACT_HASH} />
          </div>


          {/* Transaction history */}
          {vaultTxs.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1.5 min-h-0" style={{ borderTop: "1px solid rgba(0,212,255,0.1)" }}>
              <span className="text-[8px] font-mono uppercase tracking-widest shrink-0" style={{ color: "rgba(0,212,255,0.4)" }}>
                Tx History ({vaultTxs.length})
              </span>
              <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ height: "66px", scrollbarWidth: "thin", scrollbarColor: "rgba(0,212,255,0.3) transparent" }}>
                {vaultTxs.map((tx) => (
                  <a key={tx.hash} href={`https://testnet.cspr.live/deploy/${tx.hash}`}
                     target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-1.5 hover:opacity-75 font-mono text-[9px] shrink-0"
                     style={{ color: "#00D4FF" }}>
                    <ArrowDownCircle size={8} />
                    <span>Deposited {tx.amount} CSPR</span>
                    <span className="text-cyber-muted ml-auto">· {tx.hash.slice(0, 8)}…↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </Panel>

        {/* Portfolio Trajectory — col 2, rows 1–2 */}
        <Panel accent="#00F5FF" className="flex flex-col min-h-0" style={{ gridColumn: "2", gridRow: "1 / 3" }}>
          <PanelLabel text="Portfolio Trajectory" accent="#00F5FF" />
          <div className="flex-1 min-h-0">
            <PortfolioChart />
          </div>
        </Panel>

        {/* On-Chain Proof — col 3, row 1 */}
        <Panel accent="#00FF94" className="flex flex-col min-h-0" style={{ gridColumn: "3", gridRow: "1" }}>
          <PanelLabel text="On-Chain Proof" accent="#00FF94" />
          <div className="flex flex-col gap-2 flex-1 justify-center">
            <DeployPanel />
            <RegisterAgentButton contractHash={CONTRACT_HASH} />
            <DefiProofCard />
          </div>
        </Panel>

        {/* Allocation Matrix — col 3, row 2 */}
        <Panel accent="#BF5AF2" className="flex flex-col min-h-0" style={{ gridColumn: "3", gridRow: "2" }}>
          <PanelLabel text="Allocation Matrix" accent="#BF5AF2" />
          <div className="flex-1 min-h-0 flex items-center justify-center">
            {hasContract && displayPortfolio
              ? <AllocationDonut portfolio={displayPortfolio} />
              : <span className="text-[9px] font-mono text-cyber-muted uppercase tracking-widest">Deploy contract first</span>
            }
          </div>
        </Panel>

        {/* Neural Decision Log — col 2–3, row 3 */}
        <Panel accent="#BF5AF2" className="flex flex-col min-h-0" style={{ gridColumn: "2 / 4", gridRow: "3" }}>
          <div className="flex items-center gap-2 mb-2 shrink-0">
            <div className="w-0.5 h-3 rounded-full bg-cyber-plasma"
                 style={{ boxShadow: "0 0 5px #BF5AF2" }} />
            <span className="text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-cyber-plasma/80">
              Neural Decision Log
            </span>
            <div className="flex-1 h-px"
                 style={{ background: "linear-gradient(90deg, rgba(191,90,242,0.3), transparent)" }} />
            {decision?.action === "ALERT" && (
              <span className="flex items-center gap-1 text-[9px] font-mono text-red-400 animate-pulse">
                <AlertTriangle size={10} /> ALERT
              </span>
            )}
            {cycles.length > 0 && (
              <span className="text-[9px] font-mono text-cyber-muted">{cycles.length} entries</span>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <DecisionLog />
          </div>
        </Panel>

        {/* Yield Intelligence — col 4, rows 1–2 */}
        <Panel accent="#00FF94" className="flex flex-col min-h-0" style={{ gridColumn: "4", gridRow: "1 / 3" }}>
          <PanelLabel text="Yield Intelligence" accent="#00FF94" />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <YieldRatesPanel />
          </div>
        </Panel>

        {/* AI Chat — col 4, row 3 */}
        <Panel accent="#BF5AF2" className="flex flex-col min-h-0" style={{ gridColumn: "4", gridRow: "3" }}>
          <PanelLabel text="Ask AI Agent" accent="#BF5AF2" />
          <div className="flex-1 min-h-0">
            <ChatBox />
          </div>
        </Panel>

      </div>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="shrink-0 flex items-center justify-between px-1 mt-2">
        <div className="text-[9px] font-mono text-cyber-muted/40">
          AGENT-CASPER — Casper Agentic Buildathon 2026
        </div>
        <div className="hidden sm:flex items-center gap-3 text-[9px] font-mono text-cyber-muted/35">
          <span>Powered by <span style={{ color: "#00F5FF", opacity: 0.6 }}>Soesoe</span></span>
          <span className="w-px h-2.5 bg-cyber-dim" />
          <span>Built with <span style={{ color: "#BF5AF2", opacity: 0.6 }}>Casper SDK</span></span>
          <span className="w-px h-2.5 bg-cyber-dim" />
          <span style={{ color: "#00FF94", opacity: 0.45 }}>v1.2.0</span>
        </div>
      </footer>
    </div>
  );
}
