"use client";

import dynamic from "next/dynamic";
import { TrendingUp, RefreshCw, Activity, Zap, AlertTriangle } from "lucide-react";
import Image from "next/image";

const WalletWidget = dynamic(
  () => import("@/components/WalletWidget").then((m) => ({ default: m.WalletWidget })),
  { ssr: false }
);
const DeployPanel = dynamic(
  () => import("@/components/DeployPanel").then((m) => ({ default: m.DeployPanel })),
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

import { useAgentStore } from "@/lib/store";
import { useAgentWebSocket } from "@/lib/useWebSocket";
import { StatusBadge } from "@/components/StatusBadge";
import { PortfolioChart } from "@/components/PortfolioChart";
import { AllocationDonut } from "@/components/AllocationDonut";
import { DecisionLog } from "@/components/DecisionLog";
import { YieldRatesPanel } from "@/components/YieldRatesPanel";
import { RWAPanel } from "@/components/RWAPanel";

/* ── Panel wrapper ─────────────────────────────────────────────── */
function Panel({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`glass-panel rounded-2xl p-3 relative overflow-hidden ${className}`} style={style}>
      {children}
    </div>
  );
}

/* ── Panel label ───────────────────────────────────────────────── */
function PanelLabel({ text, accent = "#00F5FF" }: { text: string; accent?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2 shrink-0">
      <div className="w-0.5 h-3 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 5px ${accent}` }} />
      <span className="text-[9px] font-mono font-bold uppercase tracking-[0.2em]"
            style={{ color: accent, opacity: 0.8 }}>
        {text}
      </span>
      <div className="flex-1 h-px"
           style={{ background: `linear-gradient(90deg, ${accent}30, transparent)` }} />
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
    <div className="glass-panel rounded-xl px-3 py-2 relative overflow-hidden group transition-all duration-300"
         style={{ borderTopColor: `${accent}35`, borderTopWidth: 1 }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-mono uppercase tracking-widest text-cyber-muted">{label}</span>
        <Icon size={11} style={{ color: accent, opacity: 0.6 }} />
      </div>
      <div className="font-mono font-bold cyber-num leading-none"
           style={{ fontSize: 16, color: accent, textShadow: `0 0 14px ${accent}80` }}>
        {value}
      </div>
      {sub && <div className="text-[9px] font-mono text-cyber-muted mt-1 uppercase tracking-wider truncate">{sub}</div>}
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────── */
export default function DashboardPage() {
  useAgentWebSocket();

  const { connected, latestCycle, cycles } = useAgentStore();

  const portfolio   = latestCycle?.portfolio;
  const decision    = latestCycle?.decision;
  const hasContract = portfolio && portfolio.total_value_motes > 0;
  const totalCspr   = hasContract
    ? (portfolio.total_value_motes / 1e9).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : "—";
  const rebalances  = cycles.filter(c => c.decision.action === "REBALANCE").length;
  const lastAction  = decision?.action ?? "—";
  const confidence  = decision && decision.confidence > 0 ? `${(decision.confidence * 100).toFixed(0)}%` : "—";
  const blockHeight = latestCycle?.block_height ? `#${latestCycle.block_height.toLocaleString()}` : "—";
  const actionAccent =
    lastAction === "REBALANCE" ? "#00F5FF" : lastAction === "ALERT" ? "#FF2D55" : "#4B5563";

  return (
    /* Full viewport — no scroll */
    <div className="h-screen overflow-hidden flex flex-col px-3 py-2 md:px-5 md:py-3"
         style={{ maxWidth: 1700, margin: "0 auto" }}>

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
        <div className="flex items-center gap-2">
          <AgentControls />
          <DeployPanel />
          <WalletWidget />
          <StatusBadge connected={connected} />
        </div>
      </header>

      {/* ── Stat cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0 mb-2">
        <StatCard icon={TrendingUp} label="Portfolio Value"
          value={hasContract ? `${totalCspr} CSPR` : "—"}
          sub={hasContract ? `Strategy: ${portfolio.current_strategy}` : "Deploy contract first"}
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
        gridTemplateRows: "minmax(0,1fr) minmax(0,1fr) minmax(0,1.35fr)",
      }}>

        {/* RWA Oracle — col 1, rows 1–3 */}
        <Panel className="flex flex-col overflow-hidden" style={{ gridColumn: "1", gridRow: "1 / 4" }}>
          <PanelLabel text="RWA Oracle — Real-World Assets" accent="#FF9F0A" />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <RWAPanel />
          </div>
        </Panel>

        {/* Portfolio Trajectory — col 2, rows 1–2 */}
        <Panel className="flex flex-col min-h-0" style={{ gridColumn: "2", gridRow: "1 / 3" }}>
          <PanelLabel text="Portfolio Trajectory" accent="#00F5FF" />
          <div className="flex-1 min-h-0">
            <PortfolioChart />
          </div>
        </Panel>

        {/* Allocation Matrix — col 3, rows 1–2 */}
        <Panel className="flex flex-col min-h-0" style={{ gridColumn: "3", gridRow: "1 / 3" }}>
          <PanelLabel text="Allocation Matrix" accent="#BF5AF2" />
          <div className="flex-1 min-h-0 flex items-center justify-center">
            {hasContract
              ? <AllocationDonut portfolio={portfolio} />
              : <span className="text-[9px] font-mono text-cyber-muted uppercase tracking-widest">Deploy contract first</span>
            }
          </div>
        </Panel>

        {/* Neural Decision Log — col 2–3, row 3 */}
        <Panel className="flex flex-col min-h-0" style={{ gridColumn: "2 / 4", gridRow: "3" }}>
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
        <Panel className="flex flex-col min-h-0" style={{ gridColumn: "4", gridRow: "1 / 3" }}>
          <PanelLabel text="Yield Intelligence" accent="#00FF94" />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <YieldRatesPanel />
          </div>
        </Panel>

        {/* AI Chat — col 4, rows 3 (half height) */}
        <Panel className="flex flex-col min-h-0" style={{ gridColumn: "4", gridRow: "3" }}>
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
          <span>Powered by <span style={{ color: "#00F5FF", opacity: 0.6 }}>Claude AI</span></span>
          <span className="w-px h-2.5 bg-cyber-dim" />
          <span>Built with <span style={{ color: "#BF5AF2", opacity: 0.6 }}>Casper SDK</span></span>
          <span className="w-px h-2.5 bg-cyber-dim" />
          <span style={{ color: "#00FF94", opacity: 0.45 }}>v1.0.0</span>
        </div>
      </footer>
    </div>
  );
}
