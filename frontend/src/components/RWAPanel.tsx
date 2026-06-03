"use client";

import { useAgentStore, RWAPrice } from "@/lib/store";

const CATEGORY_CFG: Record<string, { color: string; glow: string; icon: string }> = {
  "Commodity":     { color: "#FF9F0A", glow: "rgba(255,159,10,0.35)",  icon: "◈" },
  "Fixed Income":  { color: "#00F5FF", glow: "rgba(0,245,255,0.35)",   icon: "◎" },
  "Energy":        { color: "#BF5AF2", glow: "rgba(191,90,242,0.35)",  icon: "⬡" },
};

function AssetCard({ asset }: { asset: RWAPrice }) {
  const cfg  = CATEGORY_CFG[asset.category] ?? { color: "#6B7280", glow: "transparent", icon: "◇" };
  const hasPx = asset.price_usd !== null && asset.price_usd !== undefined;
  const hasYd = asset.yield_pct !== null  && asset.yield_pct !== undefined;

  const mainValue = hasPx
    ? `$${Number(asset.price_usd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : hasYd
    ? `${Number(asset.yield_pct).toFixed(2)}%`
    : "—";

  const mainLabel = hasPx ? "USD" : hasYd ? "p.a." : "";

  const change = asset.change_pct;
  const changeColor = change === null ? "#4B5563"
    : change > 0   ? "#00FF94"
    : change < 0   ? "#FF2D55"
    : "#4B5563";

  return (
    <div
      className="glass-panel rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden
                 transition-all duration-300 hover:scale-[1.02] cursor-default"
      style={{ borderColor: `${cfg.color}22` }}
    >
      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-px"
           style={{ background: `linear-gradient(90deg, transparent, ${cfg.color}60, transparent)` }} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm" style={{ color: cfg.color }}>{cfg.icon}</span>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest"
                style={{ color: cfg.color, opacity: 0.75 }}>
            {asset.asset_id}
          </span>
        </div>
        {asset.on_chain && (
          <span className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                style={{ color: "#00FF94", background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.2)" }}>
            ON-CHAIN
          </span>
        )}
      </div>

      {/* Main value */}
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono font-bold cyber-num leading-none"
              style={{ fontSize: 22, color: cfg.color, textShadow: `0 0 14px ${cfg.glow}` }}>
          {mainValue}
        </span>
        <span className="text-[10px] font-mono text-cyber-muted">{mainLabel}</span>
      </div>

      {/* Change */}
      {change !== null && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono" style={{ color: changeColor }}>
            {change > 0 ? "▲" : change < 0 ? "▼" : "●"} {Math.abs(change).toFixed(2)}%
          </span>
          <span className="text-[9px] text-cyber-muted font-mono">24h</span>
        </div>
      )}

      {/* Asset name + unit */}
      <div className="text-[9px] font-mono text-cyber-muted leading-tight mt-0.5">
        {asset.name} · {asset.unit}
      </div>

      {/* Note */}
      {asset.note && (
        <div className="text-[9px] text-gray-600 leading-tight truncate" title={asset.note}>
          {asset.note}
        </div>
      )}
    </div>
  );
}

export function RWAPanel() {
  const { latestCycle } = useAgentStore();
  const prices: RWAPrice[]                     = latestCycle?.rwa_prices ?? [];
  const txHashes: Record<string, string>       = latestCycle?.rwa_tx_hashes ?? {};

  if (prices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-3">
        <div className="w-6 h-6 rounded-full border-2 border-cyber-fire/30 border-t-cyber-fire animate-spin" />
        <span className="text-[10px] font-mono text-cyber-muted uppercase tracking-widest">
          Fetching RWA data...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {prices.map(p => <AssetCard key={p.asset_id} asset={p} />)}
      </div>

      {/* On-chain proof row */}
      {Object.keys(txHashes).length > 0 && (
        <div className="flex flex-wrap gap-3 pt-2 border-t"
             style={{ borderColor: "rgba(255,159,10,0.15)" }}>
          <span className="text-[9px] font-mono text-cyber-muted uppercase tracking-widest self-center">
            On-chain proof:
          </span>
          {Object.entries(txHashes).map(([asset, hash]) => (
            <span key={asset}
                  className="font-mono text-[9px] px-2 py-1 rounded truncate max-w-[220px]"
                  style={{ color: "#FF9F0A", background: "rgba(255,159,10,0.08)", border: "1px solid rgba(255,159,10,0.2)" }}
                  title={hash}>
              {asset}: {hash.slice(0, 18)}…
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
