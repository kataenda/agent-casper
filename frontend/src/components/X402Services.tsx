"use client";

import { useState, useEffect, useCallback } from "react";
import { Store, X, Zap, ArrowDownLeft, ArrowUpRight, ShieldCheck } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ACCENT = "#00FF94";

interface Service {
  resource: string;
  price_cspr: number;
  description: string;
}
interface X402Info {
  enabled: boolean;
  roles: string[];
  provider?: {
    network: string;
    receives_to: string;
    services: Service[];
  };
}

/* Chamfered corner clip — matches the dashboard panel aesthetic */
const CLIP = "polygon(14px 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%,0 14px)";

export function X402Services() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<X402Info | null>(null);
  const [probe, setProbe] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`${API}/x402/info`).then(r => r.json()).then(setInfo).catch(() => {});
  }, []);

  // Live "try it" — hit the paid endpoint with NO payment → show the 402 challenge.
  const probeEndpoint = useCallback(async (resource: string) => {
    setProbe(p => ({ ...p, [resource]: "…" }));
    try {
      const r = await fetch(`${API}${resource}`);
      setProbe(p => ({ ...p, [resource]: `HTTP ${r.status} ${r.status === 402 ? "Payment Required ✓" : ""}` }));
    } catch {
      setProbe(p => ({ ...p, [resource]: "unreachable" }));
    }
  }, []);

  const isProvider = info?.roles?.includes("provider");

  return (
    <>
      {/* Header button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded border font-mono text-[9px] uppercase tracking-widest transition-all hover:opacity-80"
        style={{ borderColor: `${ACCENT}55`, color: ACCENT, background: `${ACCENT}0d`, boxShadow: `0 0 10px ${ACCENT}22` }}
        title="x402 service catalog — what this agent sells"
      >
        <Store size={11} /> x402
        {isProvider && (
          <span className="w-1 h-1 rounded-full" style={{ background: ACCENT, boxShadow: `0 0 5px ${ACCENT}` }} />
        )}
      </button>

      {/* Overlay */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,3,0.82)", backdropFilter: "blur(6px)" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-[640px] p-[1.5px]"
            style={{ clipPath: CLIP, background: ACCENT, filter: `drop-shadow(0 0 24px ${ACCENT}88)` }}
          >
            <div className="relative p-5" style={{ clipPath: CLIP, background: "rgba(2,3,7,0.99)" }}>
              {/* top glow bar */}
              <div style={{
                position: "absolute", top: 0, left: "8%", right: "8%", height: 2,
                background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`,
                boxShadow: `0 0 12px 2px ${ACCENT}88`,
              }} />

              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Store size={16} style={{ color: ACCENT }} />
                    <h2 className="font-mono font-bold uppercase tracking-[0.15em] text-sm" style={{ color: ACCENT }}>
                      x402 Service Catalog
                    </h2>
                  </div>
                  <p className="text-[10px] font-mono text-cyber-muted mt-1 tracking-wide">
                    Agent economy — services this agent <span style={{ color: ACCENT }}>sells</span> to other agents
                  </p>
                </div>
                <button onClick={() => setOpen(false)} className="text-cyber-muted hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* Roles — the closed loop */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <RolePill icon={ArrowDownLeft} label="CONSUMER" sub="pays for data" color="#00D4FF"
                          active={!!info?.roles?.includes("consumer")} />
                <span className="font-mono text-cyber-muted text-xs">+</span>
                <RolePill icon={ArrowUpRight} label="PROVIDER" sub="gets paid" color={ACCENT}
                          active={!!isProvider} />
                <span className="ml-auto text-[9px] font-mono uppercase tracking-widest px-2 py-1 rounded"
                      style={{ color: ACCENT, background: `${ACCENT}10`, border: `1px solid ${ACCENT}33` }}>
                  ⟲ Closed Loop
                </span>
              </div>

              {/* Services */}
              <div className="flex flex-col gap-2.5">
                {info?.provider?.services?.map(s => (
                  <div key={s.resource} className="relative p-3"
                       style={{ background: `${ACCENT}06`, border: `1px solid ${ACCENT}22`,
                                clipPath: "polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <code className="font-mono text-[12px] font-bold" style={{ color: ACCENT }}>{s.resource}</code>
                      <span className="font-mono text-[13px] font-black shrink-0" style={{ color: "#fff", textShadow: `0 0 10px ${ACCENT}` }}>
                        {s.price_cspr} CSPR
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-cyber-muted mt-1.5 leading-relaxed">{s.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => probeEndpoint(s.resource)}
                        className="text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border transition-all hover:opacity-80"
                        style={{ borderColor: `${ACCENT}44`, color: ACCENT, background: `${ACCENT}0a` }}
                      >
                        <Zap size={8} className="inline mr-1" /> Try it (no payment)
                      </button>
                      {probe[s.resource] && (
                        <span className="text-[9px] font-mono" style={{ color: probe[s.resource].includes("402") ? ACCENT : "#FF9F0A" }}>
                          {probe[s.resource]}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {!info?.provider?.services?.length && (
                  <p className="text-[10px] font-mono text-cyber-muted">Loading catalog…</p>
                )}
              </div>

              {/* Footer meta */}
              <div className="flex items-center justify-between mt-4 pt-3 text-[9px] font-mono"
                   style={{ borderTop: `1px solid ${ACCENT}1a`, color: "rgba(255,255,255,0.4)" }}>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck size={10} style={{ color: ACCENT }} />
                  ed25519 proof · settled via CSPR.cloud facilitator
                </span>
                <span className="uppercase tracking-widest" style={{ color: ACCENT }}>
                  {info?.provider?.network === "casper:casper" ? "Casper Mainnet" : info?.provider?.network || ""}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RolePill({ icon: Icon, label, sub, color, active }: {
  icon: React.ElementType; label: string; sub: string; color: string; active: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded"
         style={{ background: active ? `${color}10` : "transparent", border: `1px solid ${active ? `${color}40` : "rgba(255,255,255,0.1)"}`,
                  opacity: active ? 1 : 0.4 }}>
      <Icon size={13} style={{ color }} />
      <div className="leading-none">
        <div className="font-mono font-bold text-[10px] tracking-widest" style={{ color }}>{label}</div>
        <div className="font-mono text-[8px] text-cyber-muted mt-0.5">{sub}</div>
      </div>
    </div>
  );
}
