"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Portfolio } from "@/lib/store";

const SEGMENTS = [
  { key: "conservative_pct", label: "Conservative", color: "#00FF94", glow: "rgba(0,255,148,0.4)" },
  { key: "balanced_pct",     label: "Balanced",     color: "#00F5FF", glow: "rgba(0,245,255,0.4)" },
  { key: "aggressive_pct",   label: "Aggressive",   color: "#BF5AF2", glow: "rgba(191,90,242,0.4)" },
];

function CyberTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const seg = SEGMENTS.find(s => s.label === payload[0].name);
  return (
    <div className="glass-panel rounded-lg px-3 py-2 text-xs"
         style={{ borderColor: seg ? `${seg.color}40` : undefined }}>
      <div className="font-mono font-bold" style={{ color: seg?.color }}>
        {payload[0].name}
      </div>
      <div className="font-mono text-cyber-bright mt-0.5">
        {payload[0].value}%
      </div>
    </div>
  );
}

interface Props { portfolio: Portfolio; }

export function AllocationDonut({ portfolio }: Props) {
  const totalCspr = (portfolio.total_value_motes / 1e9).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });

  const rawData = SEGMENTS.map(s => ({
    name:  s.label,
    value: portfolio[s.key as keyof Portfolio] as number,
    color: s.color,
    glow:  s.glow,
  }));
  // If all percentages are 0, show a placeholder ring so the donut always renders
  const hasAllocation = rawData.some(d => d.value > 0);
  const data = hasAllocation ? rawData.filter(d => d.value > 0) : [
    { name: "Conservative", value: 40, color: "#00FF9420", glow: "rgba(0,255,148,0.1)" },
    { name: "Balanced",     value: 50, color: "#00F5FF20", glow: "rgba(0,245,255,0.1)" },
    { name: "Aggressive",   value: 10, color: "#BF5AF220", glow: "rgba(191,90,242,0.1)" },
  ];

  return (
    <div className="flex flex-row items-center gap-3">
      {/* Donut + center overlay */}
      <div className="relative shrink-0" style={{ width: 150, height: 150 }}>
        <ResponsiveContainer width="100%" height={150}>
          <PieChart>
            <defs>
              {data.map((_d, i) => (
                <filter key={i} id={`glow-${i}`}>
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              ))}
            </defs>
            <Pie
              data={data}
              cx="50%" cy="50%"
              innerRadius={46} outerRadius={66}
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} filter={`url(#glow-${i})`} opacity={0.9} />
              ))}
            </Pie>
            <Tooltip content={<CyberTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-sm font-mono font-bold cyber-num glow-cyan"
                 style={{ color: "#00F5FF" }}>
              {totalCspr}
            </div>
            <div className="text-[8px] font-mono text-cyber-muted uppercase tracking-widest">
              CSPR
            </div>
            <div className="text-[8px] font-mono uppercase tracking-wider"
                 style={{ color: "#00F5FF", opacity: 0.6 }}>
              {portfolio.current_strategy}
            </div>
          </div>
        </div>
      </div>

      {/* Legend bars — kanan */}
      <div className="flex-1 space-y-2">
        {SEGMENTS.map(s => {
          const pct = portfolio[s.key as keyof Portfolio] as number;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <div className="w-10 text-[9px] font-mono text-cyber-muted uppercase tracking-wide shrink-0">
                {s.label.slice(0, 4)}
              </div>
              <div className="flex-1 h-1 rounded-full bg-cyber-deep overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, backgroundColor: s.color, boxShadow: `0 0 4px ${s.glow}` }}
                />
              </div>
              <div className="w-7 text-right text-[9px] font-mono shrink-0"
                   style={{ color: s.color }}>
                {pct}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
