"use client";

import { useState, useEffect } from "react";
import { Play, Square, Loader } from "lucide-react";

const BACKEND = "http://localhost:8000";

export function AgentControls() {
  const [running, setRunning] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  // Poll status every 5 seconds
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const r = await fetch(`${BACKEND}/agent/status`);
        const d = await r.json();
        setRunning(d.running);
      } catch {}
    };
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, []);

  const toggle = async () => {
    if (running === null) return;
    setLoading(true);
    try {
      const action = running ? "pause" : "resume";
      await fetch(`${BACKEND}/agent/${action}`, { method: "POST" });
      setRunning(!running);
    } catch {}
    setLoading(false);
  };

  if (running === null) return null;

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
        : running ? <Square size={10} /> : <Play size={10} />
      }
      {loading ? "..." : running ? "Stop Agent" : "Start Agent"}
    </button>
  );
}
