"use client";

import { useState } from "react";
import { Play, Square, Loader } from "lucide-react";
import { useAgentStore } from "@/lib/store";

const BACKEND = "http://localhost:8000";

export function AgentControls() {
  const { stats } = useAgentStore();
  const [loading, setLoading] = useState(false);

  const running = stats?.running ?? true;

  const toggle = async () => {
    setLoading(true);
    try {
      await fetch(`${BACKEND}/agent/${running ? "pause" : "resume"}`, { method: "POST" });
    } catch {}
    setLoading(false);
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={running ? "Stop AI Agent" : "Start AI Agent"}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-widest transition-all duration-300 disabled:opacity-50"
      style={running ? {
        background:  "rgba(255,45,85,0.07)",
        borderColor: "rgba(255,45,85,0.35)",
        color:       "#FF2D55",
      } : {
        background:  "rgba(0,255,148,0.07)",
        borderColor: "rgba(0,255,148,0.35)",
        color:       "#00FF94",
      }}
    >
      {loading
        ? <Loader size={10} className="animate-spin" />
        : running
          ? <Square size={10} />
          : <Play size={10} />
      }
      {loading ? "..." : running ? "Stop Agent" : "Start Agent"}
    </button>
  );
}
