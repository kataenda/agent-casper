"use client";

import { format } from "date-fns";
import { useAgentStore, AgentCycle } from "@/lib/store";

const ACTION_CFG = {
  HOLD:      { color: "#FFFFFF", border: "rgba(255,255,255,0.3)", bg: "rgba(255,255,255,0.06)", label: "HOLD"      },
  REBALANCE: { color: "#00F5FF", border: "rgba(0,245,255,0.3)",  bg: "rgba(0,245,255,0.06)",  label: "REBALANCE" },
  ALERT:     { color: "#FF2D55", border: "rgba(255,45,85,0.3)",  bg: "rgba(255,45,85,0.06)",  label: "ALERT ⚠"   },
};

const RISK_CFG = {
  LOW:    { color: "#00FF94", label: "LOW" },
  MEDIUM: { color: "#FF9F0A", label: "MED" },
  HIGH:   { color: "#FF2D55", label: "HIGH" },
};

function AllocBadge({ con, bal, agg }: { con: number; bal: number; agg: number }) {
  return (
    <div className="flex items-center gap-1 font-mono text-[9px]">
      <span style={{ color: "#00FF94" }}>{con}%</span>
      <span className="text-cyber-muted">/</span>
      <span style={{ color: "#00F5FF" }}>{bal}%</span>
      <span className="text-cyber-muted">/</span>
      <span style={{ color: "#BF5AF2" }}>{agg}%</span>
    </div>
  );
}

const EXPLORER = "https://testnet.cspr.live/deploy";

function TxLink({ hash, label }: { hash: string; label?: string }) {
  if (!hash) return null;
  const isSim = hash.startsWith("sim-");
  if (isSim) return (
    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded"
          style={{ color: "#FFFFFF", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)" }}>
      {label ?? "SIM"}
    </span>
  );
  return (
    <a href={`${EXPLORER}/${hash}`} target="_blank" rel="noopener noreferrer"
       className="font-mono text-[9px] px-1.5 py-0.5 rounded hover:opacity-75 transition-opacity"
       style={{ color: "#00FF94", background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.2)" }}
       title={hash}>
      {label ?? "TX"}:{hash.slice(0, 10)}…↗
    </a>
  );
}

function NoTxBadge({ error }: { error?: string | null }) {
  if (!error) return null;
  const isQuota   = error.startsWith("QUOTA");
  const isPaused  = error === "PAUSED";
  const color     = isQuota ? "#FF9F0A" : isPaused ? "#BF5AF2" : "#FF2D55";
  const label     = isQuota ? `QUOTA ${error.split(" ")[1]}` : isPaused ? "PAUSED" : "TX FAILED";
  return (
    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded"
          style={{ color, background: `${color}12`, border: `1px solid ${color}30` }}>
      {label}
    </span>
  );
}

function CycleRow({ cycle, index }: { cycle: AgentCycle; index: number }) {
  const { decision, timestamp, block_height, tx_hash, rwa_tx_hashes, error } = cycle;
  const time    = format(new Date(timestamp), "HH:mm:ss");
  const action  = ACTION_CFG[decision.action] ?? ACTION_CFG.HOLD;
  const risk    = RISK_CFG[decision.risk_level] ?? RISK_CFG.LOW;
  const confPct = (decision.confidence * 100).toFixed(0);
  const isNew   = index === 0;

  return (
    <div
      className={`rounded-xl px-3 py-2 border transition-all duration-300 terminal-entry`}
      style={{
        background:   action.bg,
        borderColor:  action.border,
        opacity:      index > 0 ? Math.max(0.5, 1 - index * 0.12) : 1,
      }}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {/* Action tag */}
          <span
            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-widest"
            style={{ background: `${action.color}18`, color: action.color, border: `1px solid ${action.color}40` }}
          >
            {action.label}
          </span>
          {/* Risk tag */}
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                style={{ color: risk.color, background: `${risk.color}12` }}>
            {risk.label} RISK
          </span>
        </div>

        <div className="flex items-center gap-3 text-[10px] font-mono text-cyber-muted">
          <span>{time}</span>
          <span style={{ color: "#00FF94", opacity: 0.6 }}>#{block_height.toLocaleString()}</span>
        </div>
      </div>

      {/* Reasoning */}
      <p className="text-[11px] text-gray-400 leading-snug font-light mb-1.5">
        {decision.reasoning}
      </p>

      {/* Bottom row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-cyber-muted">
            CONF <span className="text-cyber-bright">{confPct}%</span>
          </span>
          {decision.action === "REBALANCE" && (
            <AllocBadge con={decision.conservative_pct} bal={decision.balanced_pct} agg={decision.aggressive_pct} />
          )}
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {tx_hash
            ? <TxLink hash={tx_hash} label="REBALANCE" />
            : decision.action === "REBALANCE" && <NoTxBadge error={error} />
          }
          {rwa_tx_hashes && Object.entries(rwa_tx_hashes).map(([asset, hash]) =>
            hash ? <TxLink key={asset} hash={hash} label={asset} /> : null
          )}
        </div>
      </div>
    </div>
  );
}

export function DecisionLog() {
  const { cycles } = useAgentStore();

  if (cycles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3">
        <div className="text-[10px] font-mono text-cyber-muted uppercase tracking-widest animate-pulse">
          Awaiting first neural cycle...
        </div>
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-1 h-1 rounded-full bg-cyber-glow/40 animate-bounce"
                 style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {cycles.map((c, i) => <CycleRow key={i} cycle={c} index={i} />)}
    </div>
  );
}
