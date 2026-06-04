"use client";

import { useAgentStore, RWAPrice } from "@/lib/store";

const ASSET_CFG: Record<string, {
  color: string; glow: string; bg: string;
  icon: string; label: string; accentBar: string;
}> = {
  PAXG: {
    color: "#FF9F0A", glow: "rgba(255,159,10,0.4)", bg: "rgba(255,159,10,0.05)",
    icon: "◈", label: "Gold", accentBar: "#FF9F0A",
  },
  UST10Y: {
    color: "#00F5FF", glow: "rgba(0,245,255,0.4)", bg: "rgba(0,245,255,0.05)",
    icon: "◎", label: "T-Bond", accentBar: "#00F5FF",
  },
  WTI: {
    color: "#BF5AF2", glow: "rgba(191,90,242,0.4)", bg: "rgba(191,90,242,0.05)",
    icon: "⬡", label: "Oil", accentBar: "#BF5AF2",
  },
};

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 4px ${color}` }}
        />
      </div>
      <span className="text-[8px] font-mono tabular-nums" style={{ color, minWidth: 28, textAlign: "right" }}>
        {value > 0 ? "+" : ""}{value.toFixed(2)}%
      </span>
    </div>
  );
}

function AssetRow({ asset }: { asset: RWAPrice }) {
  const cfg = ASSET_CFG[asset.asset_id] ?? {
    color: "#6B7280", glow: "transparent", bg: "rgba(107,114,128,0.05)",
    icon: "◇", label: asset.category, accentBar: "#6B7280",
  };

  const hasPx = asset.price_usd !== null && asset.price_usd !== undefined;
  const hasYd = asset.yield_pct !== null && asset.yield_pct !== undefined;

  const mainValue = hasPx
    ? `$${Number(asset.price_usd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : hasYd
    ? `${Number(asset.yield_pct).toFixed(2)}%`
    : "—";

  const change = asset.change_pct ?? 0;
  const changeColor = change > 0 ? "#00FF94" : change < 0 ? "#FF3B5C" : "#4B5563";

  return (
    <div
      className="relative rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.015] cursor-default group"
      style={{ background: cfg.bg, border: `1px solid ${cfg.color}18` }}
    >
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl"
           style={{ background: `linear-gradient(180deg, ${cfg.color}, ${cfg.color}40)` }} />

      {/* Top shimmer */}
      <div className="absolute top-0 left-0 right-0 h-px opacity-60"
           style={{ background: `linear-gradient(90deg, transparent 10%, ${cfg.color}80, transparent 90%)` }} />

      <div className="pl-4 pr-3 pt-3 pb-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base leading-none" style={{ color: cfg.color, filter: `drop-shadow(0 0 6px ${cfg.color})` }}>
              {cfg.icon}
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono font-bold tracking-widest" style={{ color: cfg.color }}>
                  {asset.asset_id}
                </span>
                <span className="text-[8px] font-mono text-cyber-muted opacity-60">·</span>
                <span className="text-[8px] font-mono text-cyber-muted uppercase tracking-wide">{cfg.label}</span>
              </div>
              <div className="text-[8px] font-mono text-cyber-muted/50 mt-0.5 leading-none truncate max-w-[140px]">
                {asset.name}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-0.5">
            {asset.on_chain && (
              <div className="flex items-center gap-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-70"
                        style={{ backgroundColor: "#00FF94" }} />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#00FF94]" />
                </span>
                <span className="text-[7px] font-mono tracking-wider" style={{ color: "#00FF94" }}>LIVE</span>
              </div>
            )}
            <span className="text-[7px] font-mono text-cyber-muted/40 uppercase">{asset.source}</span>
          </div>
        </div>

        {/* Value row */}
        <div className="flex items-end justify-between mb-2">
          <div className="flex items-baseline gap-1">
            <span className="font-mono font-bold tabular-nums leading-none"
                  style={{ fontSize: 20, color: cfg.color, textShadow: `0 0 16px ${cfg.glow}` }}>
              {mainValue}
            </span>
            <span className="text-[9px] font-mono text-cyber-muted/60">
              {hasPx ? asset.unit : "p.a."}
            </span>
          </div>

          {/* Change badge */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full"
               style={{ background: `${changeColor}12`, border: `1px solid ${changeColor}25` }}>
            <span className="text-[9px] leading-none" style={{ color: changeColor }}>
              {change > 0 ? "▲" : change < 0 ? "▼" : "●"}
            </span>
            <span className="text-[9px] font-mono tabular-nums font-bold" style={{ color: changeColor }}>
              {Math.abs(change).toFixed(2)}%
            </span>
            <span className="text-[7px] font-mono text-cyber-muted/50">24h</span>
          </div>
        </div>

        {/* Mini change bar */}
        <MiniBar value={change} max={3} color={changeColor} />

        {/* Note */}
        {asset.note && (
          <div className="mt-2 text-[8px] font-mono text-cyber-muted/40 leading-tight truncate"
               title={asset.note}>
            {asset.note}
          </div>
        )}
      </div>
    </div>
  );
}

function OnChainProof({ hashes }: { hashes: Record<string, string> }) {
  if (Object.keys(hashes).length === 0) return null;

  return (
    <div className="mt-3 rounded-xl overflow-hidden"
         style={{ background: "rgba(0,255,148,0.03)", border: "1px solid rgba(0,255,148,0.12)" }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2"
           style={{ borderBottom: "1px solid rgba(0,255,148,0.08)" }}>
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50"
                style={{ backgroundColor: "#00FF94" }} />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#00FF94]" />
        </span>
        <span className="text-[8px] font-mono font-bold uppercase tracking-[0.2em]"
              style={{ color: "#00FF94", opacity: 0.7 }}>
          On-Chain Proof
        </span>
        <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(0,255,148,0.2), transparent)" }} />
        <span className="text-[7px] font-mono text-cyber-muted/40 uppercase">Casper Testnet</span>
      </div>

      {/* Hash rows */}
      <div className="px-3 py-2 space-y-1.5">
        {Object.entries(hashes).map(([asset, hash]) => {
          const cfg = ASSET_CFG[asset];
          return (
            <div key={asset} className="flex items-center gap-2 group">
              <span className="text-[8px] font-mono font-bold w-12 shrink-0"
                    style={{ color: cfg?.color ?? "#6B7280" }}>
                {asset}
              </span>
              <div className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded-lg overflow-hidden"
                   style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.08)" }}>
                <span className="text-[7px]" style={{ color: "#00FF94", opacity: 0.5 }}>⛓</span>
                <span className="font-mono text-[8px] text-cyber-muted/60 truncate tracking-wide flex-1"
                      title={hash}>
                  {hash.slice(0, 8)}
                  <span className="text-cyber-muted/30">····</span>
                  {hash.slice(-6)}
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(hash)}
                  className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity text-[8px]"
                  style={{ color: "#00FF94" }}
                  title="Copy hash"
                >
                  ⧉
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RWAPanel() {
  const { latestCycle } = useAgentStore();
  const prices: RWAPrice[] = latestCycle?.rwa_prices ?? [];
  const txHashes: Record<string, string> = latestCycle?.rwa_tx_hashes ?? {};

  if (prices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3">
        <div className="relative">
          <div className="w-8 h-8 rounded-full border border-cyber-fire/20 animate-spin"
               style={{ borderTopColor: "#FF9F0A" }} />
          <div className="absolute inset-1 rounded-full border border-cyber-fire/10 animate-spin"
               style={{ borderBottomColor: "#FF9F0A", animationDirection: "reverse", animationDuration: "1.5s" }} />
        </div>
        <span className="text-[9px] font-mono text-cyber-muted/50 uppercase tracking-[0.2em]">
          Fetching RWA oracle…
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {prices.map(p => <AssetRow key={p.asset_id} asset={p} />)}
      <OnChainProof hashes={txHashes} />
    </div>
  );
}
