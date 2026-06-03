"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { useAgentStore } from "@/lib/store";

function CyberTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-panel rounded-lg px-3 py-2 text-xs"
         style={{ borderColor: "rgba(0,245,255,0.3)", minWidth: 130 }}>
      <div className="font-mono text-cyber-muted mb-1">{label}</div>
      <div className="font-mono font-bold text-cyber-glow glow-cyan">
        {Number(payload[0].value).toLocaleString(undefined, { maximumFractionDigits: 0 })} CSPR
      </div>
    </div>
  );
}

export function PortfolioChart() {
  const { portfolioHistory } = useAgentStore();

  if (portfolioHistory.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-44 gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-cyber-glow/30 border-t-cyber-glow animate-spin" />
        <span className="text-xs font-mono text-cyber-muted uppercase tracking-widest">
          Awaiting agent cycles...
        </span>
      </div>
    );
  }

  const minVal = Math.min(...portfolioHistory.map(p => p.value));
  const maxVal = Math.max(...portfolioHistory.map(p => p.value));
  const pad = (maxVal - minVal) * 0.1 || 1000;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={portfolioHistory} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="cyberGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#00F5FF" stopOpacity={0.35} />
            <stop offset="60%"  stopColor="#00F5FF" stopOpacity={0.08} />
            <stop offset="100%" stopColor="#00F5FF" stopOpacity={0}    />
          </linearGradient>
          <filter id="lineGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <CartesianGrid
          strokeDasharray="1 6"
          stroke="rgba(0,245,255,0.06)"
          vertical={false}
        />
        <XAxis
          dataKey="time"
          tick={{ fill: "#3A4055", fontSize: 10, fontFamily: "var(--font-space-mono)" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[minVal - pad, maxVal + pad]}
          tick={{ fill: "#3A4055", fontSize: 10, fontFamily: "var(--font-space-mono)" }}
          axisLine={false}
          tickLine={false}
          width={60}
          tickFormatter={v => `${(v/1000).toFixed(0)}K`}
        />
        <Tooltip content={<CyberTooltip />} cursor={{ stroke: "rgba(0,245,255,0.2)", strokeWidth: 1 }} />

        <Area
          type="monotone"
          dataKey="value"
          stroke="#00F5FF"
          strokeWidth={2}
          fill="url(#cyberGrad)"
          filter="url(#lineGlow)"
          name="Portfolio"
          dot={false}
          activeDot={{ r: 4, fill: "#00F5FF", stroke: "#030712", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
