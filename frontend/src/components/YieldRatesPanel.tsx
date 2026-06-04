"use client";

import { useAgentStore, YieldRate } from "@/lib/store";

const STRATEGIES: Record<string, { color: string; glow: string; label: string }> = {
  conservative: { color: "#00FF94", glow: "rgba(0,255,148,0.35)", label: "CONSERVATIVE" },
  balanced:     { color: "#00F5FF", glow: "rgba(0,245,255,0.35)", label: "BALANCED"     },
  aggressive:   { color: "#BF5AF2", glow: "rgba(191,90,242,0.35)", label: "AGGRESSIVE"  },
};

function RiskMeter({ score }: { score: number }) {
  const pct  = score * 100;
  const color = score < 0.35 ? "#00FF94" : score < 0.65 ? "#FF9F0A" : "#FF2D55";
  return (
    <div className="mt-1">
      <div className="flex justify-between mb-0.5">
        <span className="text-[9px] font-mono text-cyber-muted uppercase tracking-widest">RISK</span>
        <span className="text-[9px] font-mono" style={{ color }}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1 rounded-full bg-cyber-deep overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        />
      </div>
    </div>
  );
}

function NodeCard({ rate }: { rate: YieldRate }) {
  const cfg   = STRATEGIES[rate.strategy] ?? { color: "#6B7280", glow: "transparent", label: rate.strategy.toUpperCase() };
  const apy   = (rate.apy_bps / 100).toFixed(2);
  const tvlK  = (rate.tvl_cspr / 1000).toFixed(0);
  const tvlPct = Math.min((rate.tvl_cspr / 1_500_000) * 100, 100);

  return (
    <div
      className="glass-panel rounded-xl py-2 px-3 flex flex-col gap-0.5 relative overflow-hidden transition-all duration-300 hover:scale-[1.02]"
      style={{ borderColor: `${cfg.color}22` }}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px"
           style={{ background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)` }} />

      <div className="text-[9px] font-mono tracking-widest"
           style={{ color: cfg.color, opacity: 0.7 }}>
        {cfg.label}
      </div>

      {/* APY */}
      <div className="font-mono font-bold cyber-num leading-none"
           style={{ fontSize: 20, color: cfg.color, textShadow: `0 0 16px ${cfg.glow}` }}>
        {apy}
        <span className="text-[10px] ml-1 font-normal opacity-60">% APY</span>
      </div>

      {/* TVL bar */}
      <div className="mt-1">
        <div className="flex justify-between mb-0.5">
          <span className="text-[9px] font-mono text-cyber-muted uppercase tracking-widest">TVL</span>
          <span className="text-[9px] font-mono text-cyber-bright">{tvlK}K CSPR</span>
        </div>
        <div className="h-1 rounded-full bg-cyber-deep overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${tvlPct}%`, backgroundColor: cfg.color, opacity: 0.5 }}
          />
        </div>
      </div>

      <RiskMeter score={rate.risk_score} />
    </div>
  );
}

export function YieldRatesPanel() {
  const { latestCycle } = useAgentStore();
  const rates: YieldRate[] = latestCycle?.yield_rates ?? [];

  if (rates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3">
        <div className="w-6 h-6 rounded-full border-2 border-cyber-glow/30 border-t-cyber-glow animate-spin" />
        <span className="text-[10px] font-mono text-cyber-muted uppercase tracking-widest">
          Fetching yield data...
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rates.map(r => <NodeCard key={r.strategy} rate={r} />)}
    </div>
  );
}
