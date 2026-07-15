"use client";

import { fmtTs } from "@/lib/time";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Bot, ArrowLeft, Loader2, Activity, Zap, RefreshCw,
  ExternalLink, Cpu, Clock, Lock, Star, ShieldCheck, Check, Gauge,
} from "lucide-react";
import { adminHeaders } from "@/lib/adminAuth";
import { useWalletStore } from "@/lib/walletStore";
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
interface TrustFactor { name: string; weight: number; value: number; detail: string }
interface TrustEvent { ts: string; type: string; label: string; delta: number; tx?: string | null }
interface TrustAnchor { score: number; encoded_id: number; tx_hash: string; explorer_url: string; ts: string; note?: string }
interface Trust {
  score: number; live_score?: number; momentum?: number; max: number;
  tier: string; badge: string; badge_color: string; stars: number;
  factors: TrustFactor[]; reasons: string[]; events?: TrustEvent[];
  last_anchor?: TrustAnchor | null; method?: string; roadmap?: string;
}
interface EnrolledVault {
  package_hash: string; owner_public_key?: string; register_tx?: string;
  is_primary?: boolean; enrolled_at?: string; explorer_url?: string; register_url?: string;
  last_action?: string; last_action_tx?: string; last_action_ts?: string; last_action_note?: string;
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
  const [trust, setTrust] = useState<Trust | null>(null);
  const [anchoring, setAnchoring] = useState(false);
  const [anchorErr, setAnchorErr] = useState<string | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [pending, setPending] = useState<"anchor" | null>(null);
  const [registry, setRegistry] = useState<{ count: number; vaults: EnrolledVault[] } | null>(null);
  const { account } = useWalletStore();
  const myPk = (account?.publicKey || "").toLowerCase();

  const loadStatus = useCallback(async () => {
    try { const r = await fetch(`${API}/agent/status`); setStatus(await r.json()); } catch { /* keep */ }
  }, []);
  const loadTrust = useCallback(async () => {
    try { const r = await fetch(`${API}/agent/trust`); if (r.ok) setTrust(await r.json()); } catch { /* keep */ }
  }, []);

  const loadRegistry = useCallback(async () => {
    try { const r = await fetch(`${API}/vault/registry`); if (r.ok) setRegistry(await r.json()); } catch { /* keep */ }
  }, []);

  useEffect(() => {
    loadStatus(); loadTrust(); loadRegistry();
    fetch(`${API}/admin/agent-address`).then(r => r.json()).then(setInfo).catch(() => {});
    const t = setInterval(() => { loadStatus(); loadTrust(); loadRegistry(); }, 8000);
    return () => clearInterval(t);
  }, [loadStatus, loadTrust, loadRegistry]);

  const running = !!status?.running;

  const anchor = useCallback(async () => {
    setAnchoring(true); setAnchorErr(null);
    try {
      const r = await fetch(`${API}/agent/trust/anchor`, { method: "POST", headers: adminHeaders() });
      if (r.status === 401) { setPending("anchor"); setGateOpen(true); return; }
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "anchor failed");
      await loadTrust();
    } catch (e: any) { setAnchorErr(e.message); } finally { setAnchoring(false); }
  }, [loadTrust]);

  const onUnlock = useCallback(() => {
    setGateOpen(false);
    if (pending === "anchor") anchor();
    setPending(null);
  }, [pending, anchor]);

  const explorer = info?.agent_account_hash
    ? `https://testnet.cspr.live/account/${info.agent_account_hash.replace("account-hash-", "")}`
    : null;

  return (
    <div className="min-h-screen px-4 py-4 md:px-8 md:py-6" style={{ maxWidth: 1100, margin: "0 auto" }}>

      {/* ── Top bar ── */}
      <header className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Link href="/dashboard"
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
        <span className="font-mono text-[9px] text-cyber-muted uppercase tracking-widest">
          1 agent · {registry ? `${registry.count} vault${registry.count === 1 ? "" : "s"} serviced` : "…"} · multi-tenant live
        </span>
      </header>

      {/* ── Two-column row: Agent card (left) · Enrolled Vaults (right) ── */}
      <div className="grid gap-4 lg:grid-cols-2 items-start">

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

          <p className="text-[9px] font-mono text-cyber-muted/70 mt-4 pt-3" style={{ borderTop: `1px solid ${ACCENT}15` }}>
            The agent runs autonomously and polls every {status?.poll_interval_seconds ?? "—"}s. Run state is
            owner-controlled via the chat commands (start / stop) or the admin API — not exposed here.
          </p>
        </div>
      </Card>

      {/* ── Enrolled Vaults — multi-tenant onboarding (evidence-based) ── */}
      <div>
        <Card accent="#00D4FF">
          <div className="p-5">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} style={{ color: "#00D4FF" }} />
                <span className="font-mono font-bold text-[12px] uppercase tracking-widest text-white">Enrolled Vaults</span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: "#00D4FF14", border: "1px solid #00D4FF44", color: "#00D4FF" }}>
                  {registry?.count ?? "…"}
                </span>
              </div>
              <span className="font-mono text-[8px] text-cyber-muted uppercase tracking-widest">
                on-chain verified register_agent · tenant onboarding live
              </span>
            </div>

            {registry && registry.vaults.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {registry.vaults.map(v => (
                  <div key={v.package_hash}
                       className="flex items-center gap-2 px-3 py-2 rounded flex-wrap"
                       style={{ background: "#00D4FF06", border: "1px solid #00D4FF1f" }}>
                    {v.is_primary && (
                      <span className="font-mono text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest"
                            style={{ background: "#00FF9414", border: "1px solid #00FF9444", color: "#00FF94" }}>
                        primary · AI-managed
                      </span>
                    )}
                    {myPk && (v.owner_public_key || "").toLowerCase() === myPk && (
                      <span className="font-mono text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest"
                            style={{ background: "#FFB34714", border: "1px solid #FFB34744", color: "#FFB347" }}>
                        yours
                      </span>
                    )}
                    <a href={v.explorer_url} target="_blank" rel="noreferrer"
                       className="flex items-center gap-1 font-mono text-[10px] hover:opacity-75"
                       style={{ color: "#00D4FF" }} title="View contract package on testnet.cspr.live">
                      {v.package_hash.slice(0, 16)}… <ExternalLink size={9} />
                    </a>
                    {v.owner_public_key && (
                      <span className="font-mono text-[9px] text-cyber-muted">
                        owner {v.owner_public_key.slice(0, 10)}…
                      </span>
                    )}
                    {v.register_url && (
                      <a href={v.register_url} target="_blank" rel="noreferrer"
                         className="ml-auto flex items-center gap-1 font-mono text-[9px] hover:opacity-75"
                         style={{ color: "#00FF94" }} title="register_agent deploy on testnet.cspr.live">
                        <Check size={9} /> registered <ExternalLink size={8} />
                      </a>
                    )}
                    {v.last_action && (
                      <span className="w-full flex items-center gap-1.5 font-mono text-[8px] text-cyber-muted mt-0.5"
                            title={v.last_action_note || ""}>
                        <Zap size={8} style={{ color: "#BF5AF2" }} />
                        agent: {v.last_action}
                        {v.last_action_tx && (
                          <a href={`https://testnet.cspr.live/deploy/${v.last_action_tx}`} target="_blank" rel="noreferrer"
                             className="hover:opacity-75" style={{ color: "#00D4FF" }}>
                            {v.last_action_tx.slice(0, 12)}… <ExternalLink size={7} className="inline" />
                          </a>
                        )}
                        {v.last_action_ts && <span className="opacity-60">{fmtTs(v.last_action_ts)}</span>}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-mono text-[10px] text-cyber-muted">
                no vaults enrolled yet — a vault appears here automatically once its owner&apos;s
                on-chain <code>register_agent</code> is verified.
              </p>
            )}

            <p className="font-mono text-[8px] text-cyber-muted/60 mt-3">
              Enrollment is evidence-based (verified on-chain deploys, no self-claims). Each cycle the
              agent applies its AI market target to <b>every enrolled vault</b> — drift-gated, per-vault
              daily caps. Per-tenant keys/dashboards (full isolation) are Phase 3.
            </p>
          </div>
        </Card>
      </div>

      </div>{/* /two-column row */}

      {/* ── AI Trust Engine ── */}
      <div className="mt-4">
        <Card accent={trust?.badge_color || "#BF5AF2"}>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Gauge size={14} style={{ color: trust?.badge_color || "#BF5AF2" }} />
              <span className="font-mono font-bold uppercase tracking-[0.18em] text-[11px]" style={{ color: trust?.badge_color || "#BF5AF2" }}>
                AI Trust Engine
              </span>
              <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${(trust?.badge_color || "#BF5AF2")}55, transparent)` }} />
              <span className="font-mono text-[8px] text-cyber-muted uppercase tracking-widest">deterministic · from real data</span>
            </div>

            {!trust ? (
              <div className="flex items-center gap-2 py-10 justify-center font-mono text-[10px] text-cyber-muted">
                <Loader2 size={12} className="animate-spin" /> computing trust score…
              </div>
            ) : (
              <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(0, 240px) 1fr" }}>
                {/* Score hero */}
                <div className="flex flex-col items-center justify-center text-center px-2 py-3 rounded"
                     style={{ background: `${trust.badge_color}08`, border: `1px solid ${trust.badge_color}22` }}>
                  <span className="font-mono uppercase tracking-[0.25em] text-[8px] text-cyber-muted mb-1">Trust Score</span>
                  <div className="font-mono font-black leading-none" style={{ fontSize: 52, color: trust.badge_color, textShadow: `0 0 22px ${trust.badge_color}aa` }}>
                    {trust.score}
                  </div>
                  <span className="font-mono text-[10px] text-cyber-muted mb-2">/ {trust.max}</span>
                  <div className="flex gap-0.5 mb-2">
                    {[1,2,3,4,5].map(i => (
                      <Star key={i} size={14}
                            fill={i <= trust.stars ? trust.badge_color : "transparent"}
                            style={{ color: trust.badge_color, opacity: i <= trust.stars ? 1 : 0.3 }} />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold uppercase tracking-widest text-[11px]" style={{ color: trust.badge_color }}>{trust.tier}</span>
                    <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded"
                          style={{ color: trust.badge_color, background: `${trust.badge_color}14`, border: `1px solid ${trust.badge_color}40` }}>
                      <ShieldCheck size={9} /> {trust.badge}
                    </span>
                  </div>
                  {/* overall bar */}
                  <div className="w-full mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div className="h-full rounded-full" style={{ width: `${trust.score}%`, background: trust.badge_color, boxShadow: `0 0 10px ${trust.badge_color}` }} />
                  </div>
                  {/* live momentum */}
                  {trust.live_score != null && (
                    <div className="flex items-center gap-1.5 mt-2 font-mono text-[8px] uppercase tracking-widest text-cyber-muted">
                      <Activity size={9} style={{ color: trust.badge_color }} />
                      Live {trust.live_score}
                      <span style={{ color: (trust.momentum ?? 0) >= 0 ? "#00FF94" : "#FF6B82" }}>
                        {(trust.momentum ?? 0) >= 0 ? "↑ +" : "↓ "}{trust.momentum ?? 0}
                      </span>
                    </div>
                  )}
                </div>

                {/* Factor breakdown */}
                <div className="flex flex-col gap-2.5 justify-center">
                  {trust.factors.map(f => (
                    <div key={f.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[10px] text-white">{f.name}
                          <span className="text-cyber-muted ml-1.5 text-[8px]">· {f.weight}%</span>
                        </span>
                        <span className="font-mono text-[10px] font-bold" style={{ color: trust.badge_color }}>{f.value}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${f.value}%`, background: trust.badge_color, opacity: 0.85 }} />
                      </div>
                      <p className="text-[8px] font-mono text-cyber-muted/70 mt-0.5">{f.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Explainability */}
            {trust && (
              <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${trust.badge_color}15` }}>
                <div className="font-mono text-[10px] uppercase tracking-widest text-cyber-muted mb-2">Why {trust.score}?</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5">
                  {trust.reasons.map((r, i) => (
                    <div key={i} className="flex items-center gap-1.5 font-mono text-[10px] text-white/85">
                      <Check size={11} style={{ color: "#00FF94" }} /> {r}
                    </div>
                  ))}
                </div>
                {trust.roadmap && (
                  <p className="text-[8px] font-mono text-cyber-muted/60 mt-3">
                    {trust.method} · {trust.roadmap}
                  </p>
                )}
              </div>
            )}

            {/* Live Activity (dynamic event feed) + On-chain anchor */}
            {trust && (
              <div className="grid gap-4 mt-5 pt-4" style={{ gridTemplateColumns: "1fr 1fr", borderTop: `1px solid ${trust.badge_color}15` }}>
                {/* Event feed */}
                <div>
                  <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-cyber-muted mb-2">
                    <Activity size={11} style={{ color: trust.badge_color }} /> Live Activity
                  </div>
                  <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 150, scrollbarWidth: "thin", scrollbarColor: `${trust.badge_color}40 transparent` }}>
                    {(trust.events && trust.events.length) ? trust.events.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 font-mono text-[9px]">
                        <span className="font-bold w-9 shrink-0" style={{ color: e.delta >= 0 ? "#00FF94" : "#FF6B82" }}>
                          {e.delta >= 0 ? "+" : ""}{e.delta}
                        </span>
                        <span className="text-white/80 truncate">{e.label}</span>
                        {e.tx && (
                          <a href={e.type === "swap_success" || e.type === "swap_fail"
                                     ? `https://cspr.live/transaction/${e.tx}`
                                     : `https://testnet.cspr.live/deploy/${e.tx}`}
                             target="_blank" rel="noreferrer"
                             className="ml-auto shrink-0 hover:opacity-75" style={{ color: "#00D4FF" }}>
                            <ExternalLink size={8} />
                          </a>
                        )}
                      </div>
                    )) : <span className="font-mono text-[9px] text-cyber-muted">no events yet</span>}
                  </div>
                </div>

                {/* On-chain anchor */}
                <div>
                  <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-cyber-muted mb-2">
                    <ShieldCheck size={11} style={{ color: trust.badge_color }} /> On-chain Anchor
                  </div>
                  {trust.last_anchor ? (
                    <a href={trust.last_anchor.explorer_url} target="_blank" rel="noreferrer"
                       className="block p-2 rounded mb-2 hover:opacity-90"
                       style={{ background: `${trust.badge_color}06`, border: `1px solid ${trust.badge_color}22` }}>
                      <div className="flex items-center justify-between font-mono text-[9px]">
                        <span className="text-white">score {trust.last_anchor.score} anchored</span>
                        <span className="flex items-center gap-1" style={{ color: "#00D4FF" }}>{trust.last_anchor.tx_hash.slice(0,10)}… <ExternalLink size={8} /></span>
                      </div>
                      <div className="font-mono text-[8px] text-cyber-muted/70 mt-0.5">transfer-id {trust.last_anchor.encoded_id} = score×100 · verifiable on cspr.live</div>
                    </a>
                  ) : (
                    <p className="font-mono text-[9px] text-cyber-muted mb-2">not anchored yet — record the score on-chain so other agents can verify it.</p>
                  )}
                  <button onClick={anchor} disabled={anchoring}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-widest transition-all hover:opacity-85 disabled:opacity-50"
                          style={{ background: `${trust.badge_color}14`, border: `1px solid ${trust.badge_color}50`, color: trust.badge_color }}>
                    {anchoring ? <Loader2 size={10} className="animate-spin" /> : <ShieldCheck size={10} />} Anchor on-chain
                    <Lock size={9} className="opacity-60" />
                  </button>
                  {anchorErr && <div className="font-mono text-[8px] text-red-400 mt-1 break-words">⚠ {anchorErr}</div>}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <AdminTokenModal
        open={gateOpen}
        onClose={() => { setGateOpen(false); setPending(null); }}
        onUnlock={onUnlock}
        accent={ACCENT}
        title="Admin token required"
        message="This is a protected action (agent control / on-chain anchor). Paste the admin token to continue."
      />
    </div>
  );
}
