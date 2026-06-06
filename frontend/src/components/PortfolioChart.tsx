"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
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

function LoadingState() {
  // Animated ghost chart — looks like data is incoming
  const ghost = Array.from({ length: 20 }, (_, i) => ({
    t: i,
    v: 100 + Math.sin(i * 0.6) * 18 + Math.sin(i * 1.1) * 9,
  }));

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Ghost chart in background */}
      <div className="absolute inset-0 opacity-20">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={ghost} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <defs>
              <linearGradient id="ghostGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#00F5FF" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#00F5FF" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 6" stroke="rgba(0,245,255,0.08)" />
            <Area type="monotone" dataKey="v" stroke="#00F5FF" strokeWidth={1.5}
                  fill="url(#ghostGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Overlay — status message */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
        {/* Radar pulse rings */}
        <div className="relative flex items-center justify-center" style={{ width: 64, height: 64 }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="absolute rounded-full border"
                 style={{
                   width: 24 + i * 20, height: 24 + i * 20,
                   borderColor: `rgba(0,245,255,${0.5 - i * 0.15})`,
                   animation: `ping 2s ease-out ${i * 0.5}s infinite`,
                   opacity: 0,
                 }} />
          ))}
          <div className="w-3 h-3 rounded-full bg-cyan-400"
               style={{ boxShadow: "0 0 10px #00F5FF, 0 0 20px #00F5FF" }} />
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <span className="font-mono font-bold text-[10px] uppercase tracking-[0.3em]"
                style={{ color: "#00F5FF", textShadow: "0 0 12px #00F5FF" }}>
            Awaiting Neural Cycles
          </span>
          <span className="font-mono text-[8px] uppercase tracking-widest"
                style={{ color: "rgba(0,245,255,0.35)" }}>
            Agent initializing — data incoming
          </span>
          {/* Animated dots */}
          <div className="flex gap-1.5 mt-1">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="w-1 h-1 rounded-full"
                   style={{
                     background: "#00F5FF",
                     boxShadow: "0 0 4px #00F5FF",
                     animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                   }} />
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ping {
          0%   { transform: scale(0.5); opacity: 0.8; }
          100% { transform: scale(1);   opacity: 0;   }
        }
      `}</style>
    </div>
  );
}

export function PortfolioChart() {
  const { portfolioHistory } = useAgentStore();

  if (portfolioHistory.length < 2) return <LoadingState />;

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
        <CartesianGrid strokeDasharray="1 6" stroke="rgba(0,245,255,0.06)" vertical={false} />
        <XAxis dataKey="time"
          tick={{ fill: "#3A4055", fontSize: 10, fontFamily: "var(--font-space-mono)" }}
          axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis domain={[minVal - pad, maxVal + pad]}
          tick={{ fill: "#3A4055", fontSize: 10, fontFamily: "var(--font-space-mono)" }}
          axisLine={false} tickLine={false} width={60}
          tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
        <Tooltip content={<CyberTooltip />}
          cursor={{ stroke: "rgba(0,245,255,0.2)", strokeWidth: 1 }} />
        <Area type="monotone" dataKey="value" stroke="#00F5FF" strokeWidth={2}
          fill="url(#cyberGrad)" filter="url(#lineGlow)" name="Portfolio"
          dot={false} activeDot={{ r: 4, fill: "#00F5FF", stroke: "#030712", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
