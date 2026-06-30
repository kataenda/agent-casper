"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Bot, ArrowLeft, Play, Square, Loader2, Activity, Zap, RefreshCw,
  ExternalLink, Cpu, Clock, Lock,
} from "lucide-react";
import { adminHeaders } from "@/lib/adminAuth";
import { AdminTokenModal } from "@/components/AdminTokenModal";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ACCENT = "#00F5FF";
const CLIP = "polygon(14px 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%,0 14px)";

interface Status {
  running?: boolean;
  paused?: boolean;
  total_cycles?: number;
  poll_interval_seconds?: number;
  rebalances_today?: number;
  defi_swaps_today?: number;
}
interface AgentInfo {
  agent_account_hash?: string;
  agent_public_key?: string;
  vault_contract_hash?: string | null;
  contract_deployed?: boolean;
}

function Card({ children, accent = ACCENT }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className="relative p-[1.5px]" style={{ clipPath: CLIP, background: accent, filter: `drop-shadow(0 0 18px ${accent}44)` }}>
      <div className="relative" style={{ clipPath: CLIP, background: "rgba(2,3,7,0.99)" }}>
        <div style={{ position: "absolute", top: 0, left: "8%", right: "8%", height: 2,
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, boxShadow: `0 0 12px 2px ${accent}88` }} />
        {children}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent = ACCENT }: { icon: React.ElementType; label: string; value: string; accent?: string }) {
  return (
    <div className="px-3 py-2 rounded" style={{ background: `${accent}06`, border: `1px solid ${accent}1f` }}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={10} style={{ color: accent, opacity: 0.6 }} />
        <span className="font-mono uppercase tracking-[0.18em] text-[7px]" style={{ color: `${accent}80` }}>{label}</span>
      </div>
      <div className="font-mono font-black text-[15px]" style={{ color: "#fff" }}>{value}</div>
    </div>
  );
}

export default function AgentPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);

  const loadStatus = useCallback(async () => {
    try { const r = await fetch(`${API}/agent/status`); setStatus(await r.json()); } catch { /* keep */ }
  }, []);

  useEffect(() => {
    loadStatus();
    fetch(`${API}/admin/agent-address`).then(r => r.json()).then(setInfo).catch(() => {});
    const t = setInterval(loadStatus, 5000);
    return () => clearInterval(t);
  }, [loadStatus]);

  const running = !!status?.running;

  const toggle = useCallback(async () => {
    if (!status) return;
    setBusy(true);
    try {
      const action = running ? "pause" : "resume";
      const r = await fetch(`${API}/agent/${action}`, { method: "POST", headers: adminHeaders() });
      if (r.status === 401) { setGateOpen(true); return; }
      if (r.ok) await loadStatus();
    } catch { /* ignore */ } finally { setBusy(false); }
  }, [status, running, loadStatus]);

  const explorer = info?.agent_account_hash
    ? `https://testnet.cspr.live/account/${info.agent_account_hash.replace("account-hash-", "")}`
    : null;

  return (
    <div className="min-h-screen px-4 py-4 md:px-8 md:py-6" style={{ maxWidth: 1100, margin: "0 auto" }}>

      {/* ── Top bar ── */}
      <header className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Link href="/"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-mono text-[10px] uppercase tracking-widest transition-opacity hover:opacity-70"
                style={{ borderColor: "rgba(0,245,255,0.35)", color: "#00F5FF", background: "rgba(0,245,255,0.06)" }}>
            <ArrowLeft size={12} /> Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <Bot size={18} style={{ color: ACCENT, filter: `drop-shadow(0 0 8px ${ACCENT})` }} />
            <div>
              <h1 className="font-mono font-bold uppercase tracking-[0.15em] text-sm" style={{ color: ACCENT }}>
                Agents
              </h1>
              <p className="text-[9px] font-mono text-cyber-muted uppercase tracking-[0.15em]">
                Autonomous agent registry · run / stop control
              </p>
            </div>
          </div>
        </div>
        <span className="font-mono text-[9px] text-cyber-muted uppercase tracking-widest">1 agent · multi-tenant in Phase 3</span>
      </header>

      {/* ── Agent card ── */}
      <Card>
        <div className="p-5">
          {/* Identity + status row */}
          <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center rounded-full"
                   style={{ width: 38, height: 38, background: `${ACCENT}10`, border: `1px solid ${ACCENT}40` }}>
                <Cpu size={18} style={{ color: ACCENT }} />
              </div>
              <div>
                <div className="font-mono font-bold text-[13px] text-white">Agent Casper · Primary</div>
                {info?.agent_account_hash ? (
                  <a href={explorer || "#"} target="_blank" rel="noreferrer"
                     className="flex items-center gap-1 font-mono text-[10px] hover:opacity-75" style={{ color: "#00D4FF" }}>
                    {info.agent_account_hash.replace("account-hash-", "").slice(0, 18)}… <ExternalLink size={9} />
                  </a>
                ) : (
                  <span className="font-mono text-[10px] text-cyber-muted animate-pulse">loading…</span>
                )}
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-[10px] font-bold uppercase tracking-widest"
                  style={{
                    color: running ? "#00FF94" : "#FF9F0A",
                    background: `${running ? "#00FF94" : "#FF9F0A"}12`,
                    border: `1px solid ${running ? "#00FF94" : "#FF9F0A"}40`,
                  }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%",
                background: running ? "#00FF94" : "#FF9F0A",
                boxShadow: `0 0 6px ${running ? "#00FF94" : "#FF9F0A"}`,
                animation: running ? "pulse 2s ease-in-out infinite" : "none" }} />
              {status ? (running ? "Running" : "Paused") : "…"}
            </span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <Stat icon={Activity} label="Total Cycles" value={status?.total_cycles != null ? String(status.total_cycles) : "—"} />
            <Stat icon={Clock} label="Poll Interval" value={status?.poll_interval_seconds != null ? `${status.poll_interval_seconds}s` : "—"} accent="#00FF94" />
            <Stat icon={RefreshCw} label="Rebalances Today" value={status?.rebalances_today != null ? String(status.rebalances_today) : "—"} accent="#BF5AF2" />
            <Stat icon={Zap} label="DeFi Swaps Today" value={status?.defi_swaps_today != null ? String(status.defi_swaps_today) : "—"} accent="#FF4D6D" />
          </div>

          {/* Control */}
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={toggle} disabled={busy || !status}
                    className="flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 font-mono text-[12px] font-bold uppercase tracking-widest transition-all hover:opacity-85 disabled:opacity-50"
                    style={running
                      ? { background: "rgba(255,59,92,0.12)", border: "1px solid #FF3B5C66", color: "#FF6B82" }
                      : { background: ACCENT, color: "#000", boxShadow: `0 0 20px ${ACCENT}55` }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : running ? <Square size={13} /> : <Play size={13} />}
              {running ? "Stop Agent" : "Start Agent"}
            </button>
            <span className="flex items-center gap-1.5 font-mono text-[9px] text-cyber-muted">
              <Lock size={10} style={{ color: ACCENT }} /> protected — requires admin token
            </span>
          </div>

          <p className="text-[9px] font-mono text-cyber-muted/70 mt-4 pt-3" style={{ borderTop: `1px solid ${ACCENT}15` }}>
            The agent runs autonomously by default and polls every {status?.poll_interval_seconds ?? "—"}s. Stopping it
            halts the decision loop; starting resumes it. Only the owner (with the admin token) can change its run state.
          </p>
        </div>
      </Card>

      <AdminTokenModal
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        onUnlock={() => { setGateOpen(false); toggle(); }}
        accent={ACCENT}
        title="Admin token required"
        message="Starting or stopping the agent is a protected action. Paste the admin token to continue."
      />
    </div>
  );
}
