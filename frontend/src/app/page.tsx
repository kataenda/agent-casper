"use client";

/**
 * Landing page (/) — the front door to Agent Casper. A focused hero that states
 * what the agent is, shows live proof it's running (AUM / vaults / staked, pulled
 * from the same on-chain-derived endpoint the dashboard uses), and sends people
 * into the live dashboard. Matches the app's cyberpunk system (cyan #00F5FF,
 * chamfered octagon panels, mono type, the shared StarField background).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight, Play, Github, ShieldCheck, Layers, Coins, Cpu, Landmark, Zap,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const CYAN = "#00F5FF", PLASMA = "#BF5AF2", MATRIX = "#00FF94", FIRE = "#FF9F0A";
// Chamfered octagon — the app's signature panel shape.
const OCT = "polygon(14px 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%,0 14px)";

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K` : `${Math.round(n)}`;

const HERO_COPY =
  "Agent Casper turns a passive smart-contract vault into a self-driving portfolio manager. " +
  "Powered by Claude, it custodies real CSPR, delegates it to Casper validators for real native yield, " +
  "services many wallets’ vaults at once, and monetizes its own intelligence to other agents over " +
  "x402 — running its decision loop with no human in between.";

/**
 * Reveals text one character at a time, like someone typing at a console, with a
 * blinking caret. Height is reserved up front (an invisible copy of the full text)
 * so the buttons below never jump as lines fill in. Honours prefers-reduced-motion:
 * users who ask for less motion get the full text immediately.
 */
function TypedText({ text, speed = 42, startDelay = 350 }: { text: string; speed?: number; startDelay?: number }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    const reduce = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setN(text.length); return; }
    let i = 0, id: ReturnType<typeof setInterval>;
    const start = setTimeout(() => {
      id = setInterval(() => {
        i += 1;
        setN(i);
        if (i >= text.length) clearInterval(id);
      }, speed);
    }, startDelay);
    return () => { clearTimeout(start); clearInterval(id); };
  }, [text, speed, startDelay]);

  const done = n >= text.length;
  return (
    <span className="relative block">
      {/* invisible sizer reserves the final height so nothing below reflows */}
      <span aria-hidden className="invisible">{text}</span>
      <span className="absolute inset-0">
        {text.slice(0, n)}
        <span
          className="inline-block align-middle"
          aria-hidden
          style={{
            width: "0.55em", height: "1.05em", marginLeft: 1,
            transform: "translateY(-1px)",
            background: CYAN, boxShadow: `0 0 8px ${CYAN}`,
            animation: done ? "caret-blink 1.1s step-end infinite" : "none",
          }}
        />
      </span>
    </span>
  );
}

interface Aum { total_cspr: number; total_staked_cspr?: number; vault_count: number }

export default function Landing() {
  const [aum, setAum] = useState<Aum | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch(`${API}/vault/aum`).then((r) => r.json())
        .then((d) => { if (alive) { setAum(d); setLive(true); } })
        .catch(() => { if (alive) setLive(false); });
    };
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const stats = [
    { label: "Assets under management", value: aum ? `${fmt(aum.total_cspr)} CSPR` : "—", accent: CYAN },
    { label: "Delegated · real yield", value: aum ? `${fmt(aum.total_staked_cspr ?? 0)} CSPR` : "—", accent: MATRIX },
    { label: "Vaults serviced", value: aum ? `${aum.vault_count}` : "—", accent: PLASMA },
  ];

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-5 md:px-10 py-5 max-w-[1200px] mx-auto">
        <div className="flex items-center gap-3">
          <Image src="/agent_casper.png" alt="AGENT-CASPER" width={40} height={40}
            className="object-contain" style={{ filter: `drop-shadow(0 0 8px ${CYAN}a6)` }} priority />
          <div>
            <div className="text-sm font-bold tracking-tight leading-none">
              <span style={{ color: CYAN }}>AGENT</span><span className="text-white">-CASPER</span>
            </div>
            <div className="text-[8px] font-mono uppercase tracking-[0.2em] text-cyber-muted/60 mt-1">
              Casper Network
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href="https://github.com/kataenda/agent-casper" target="_blank" rel="noreferrer"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-[10px] uppercase tracking-widest hover:opacity-80 transition-opacity"
            style={{ borderColor: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.6)" }}>
            <Github size={12} /> Repo
          </a>
          <Link href="/dashboard"
            className="flex items-center gap-1.5 px-3.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition-all hover:brightness-125"
            style={{ background: `${CYAN}14`, border: `1px solid ${CYAN}59`, color: CYAN, clipPath: OCT,
                     boxShadow: `0 0 16px ${CYAN}33` }}>
            Launch app <ArrowRight size={12} />
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="max-w-[1000px] mx-auto px-5 md:px-10 pt-12 md:pt-20 pb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-7 rounded-full font-mono text-[9px] uppercase tracking-[0.2em]"
          style={{ border: `1px solid ${MATRIX}40`, color: MATRIX, background: `${MATRIX}0c` }}>
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-70" style={{ background: MATRIX }} />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: MATRIX }} />
          </span>
          {live ? "Live on Casper Testnet · agent running" : "Autonomous DeFi yield agent"}
        </div>

        <h1 className="text-[34px] leading-[1.05] sm:text-[52px] md:text-[64px] font-bold tracking-tight"
          style={{ textWrap: "balance" } as React.CSSProperties}>
          The AI that manages<br />
          <span style={{ color: CYAN, textShadow: `0 0 28px ${CYAN}66` }}>on-chain capital</span>{" "}
          on its own.
        </h1>

        <p className="mt-6 max-w-[660px] mx-auto font-mono text-[13px] md:text-[14px] leading-relaxed text-cyber-muted/70 text-left sm:text-center">
          <TypedText text={HERO_COPY} />
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="/dashboard"
            className="group flex items-center gap-2 px-6 py-3 font-mono text-[12px] font-bold uppercase tracking-widest transition-all hover:brightness-110"
            style={{ background: CYAN, color: "#00131a", clipPath: OCT, boxShadow: `0 0 30px ${CYAN}55` }}>
            Launch app
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a href="https://www.youtube.com/watch?v=4XiVtV4MWno" target="_blank" rel="noreferrer"
            className="flex items-center gap-2 px-5 py-3 font-mono text-[12px] font-bold uppercase tracking-widest transition-all hover:opacity-80"
            style={{ border: `1px solid ${PLASMA}59`, color: PLASMA, clipPath: OCT, background: `${PLASMA}0c` }}>
            <Play size={13} /> Watch demo
          </a>
        </div>

        {/* Live proof strip */}
        <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-[720px] mx-auto">
          {stats.map((s) => (
            <div key={s.label} className="relative p-4 text-left overflow-hidden"
              style={{ background: `linear-gradient(150deg, ${s.accent}0c, rgba(2,2,10,0.6) 60%)`,
                       border: `1px solid ${s.accent}26`, clipPath: OCT }}>
              <div className="absolute left-0 top-0 h-full w-[3px]" style={{ background: s.accent, boxShadow: `0 0 10px ${s.accent}` }} />
              <div className="font-mono font-bold text-[22px] tabular-nums pl-1" style={{ color: s.accent }}>{s.value}</div>
              <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-cyber-muted/60 mt-1 pl-1">{s.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 font-mono text-[8px] uppercase tracking-[0.2em] text-cyber-muted/40">
          reconstructed live from on-chain deploys — no self-reported numbers
        </p>
      </section>

      {/* ── Pillars ─────────────────────────────────────────────── */}
      <section className="max-w-[1000px] mx-auto px-5 md:px-10 py-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12))" }} />
          <p className="font-mono text-[8px] uppercase tracking-[0.28em] text-cyber-muted/45 whitespace-nowrap">
            The three pillars of the Casper Innovation Track
          </p>
          <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.12), transparent)" }} />
        </div>
        <div className="flex items-center justify-center gap-2.5 sm:gap-4 flex-wrap">
          {[
            { label: "Agentic AI", c: CYAN },
            { label: "DeFi", c: MATRIX },
            { label: "RWA", c: PLASMA },
          ].map((p, i) => (
            <span key={p.label} className="flex items-center gap-2.5 sm:gap-4">
              <span className="px-4 py-1.5 rounded-full font-mono text-[11px] sm:text-[12px] font-bold uppercase tracking-[0.16em]"
                style={{ color: p.c, border: `1px solid ${p.c}55`, background: `${p.c}12`,
                         boxShadow: `0 0 18px ${p.c}22, inset 0 0 12px ${p.c}0f` }}>
                {p.label}
              </span>
              {i < 2 && <span className="w-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }} />}
            </span>
          ))}
        </div>
      </section>

      {/* ── Capabilities ────────────────────────────────────────── */}
      <section className="max-w-[1100px] mx-auto px-5 md:px-10 py-14">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Landmark, c: CYAN, t: "Real on-chain custody", d: "A payable, upgradable Odra vault holds actual depositor CSPR in its contract purse — verified on testnet, not a mock." },
            { icon: Layers, c: PLASMA, t: "Multi-tenant, one agent", d: "Any wallet deploys and owns its own vault; a single agent services every enrolled vault, sized to each one's own balance." },
            { icon: ShieldCheck, c: MATRIX, t: "Real yield · native staking", d: "The agent delegates each vault's idle CSPR to a validator it picks itself (lowest fee, active) — real Casper delegation." },
            { icon: Zap, c: FIRE, t: "x402 agent economy", d: "It pays for data and gets paid by other agents over the official x402 exact scheme, settled on-chain by the CSPR.cloud facilitator." },
            { icon: Coins, c: CYAN, t: "RWA-aware decisions", d: "Verified gold, treasury and oil signals feed every allocation call and are posted on-chain as an auditable oracle trail." },
            { icon: Cpu, c: MATRIX, t: "Verifiable, not a black box", d: "Every decision commits a sha256 of its inputs + outcome on-chain each cycle — anyone can recompute and check it." },
          ].map((f) => (
            <div key={f.t} className="beam-card group p-6"
              style={{
                ["--beam" as string]: f.c,
                background: "linear-gradient(160deg, rgba(255,255,255,0.045), rgba(3,3,12,0.55))",
                border: "1px solid rgba(255,255,255,0.07)",
              } as React.CSSProperties}>
              {/* icon tile */}
              <div className="flex items-center justify-center w-11 h-11 rounded-xl mb-4 transition-all duration-300 group-hover:scale-105"
                style={{ background: `${f.c}14`, border: `1px solid ${f.c}33`,
                         boxShadow: `inset 0 0 16px ${f.c}1f` }}>
                <f.icon size={19} style={{ color: f.c, filter: `drop-shadow(0 0 6px ${f.c}88)` }} />
              </div>
              <h3 className="font-bold text-[15px] tracking-tight text-white">{f.t}</h3>
              <p className="mt-2 font-mono text-[10.5px] leading-relaxed text-cyber-muted/55">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────── */}
      <section className="max-w-[800px] mx-auto px-5 md:px-10 pb-20 text-center">
        <div className="p-8 md:p-12 relative overflow-hidden"
          style={{ background: `radial-gradient(ellipse 80% 120% at 50% 0%, ${CYAN}12, rgba(2,2,10,0.7) 70%)`,
                   border: `1px solid ${CYAN}33`, clipPath: OCT }}>
          <h2 className="text-[24px] md:text-[32px] font-bold tracking-tight" style={{ textWrap: "balance" } as React.CSSProperties}>
            See the agent think, decide, and transact.
          </h2>
          <p className="mt-3 font-mono text-[11px] text-cyber-muted/60 max-w-[460px] mx-auto">
            Live decision log, portfolio trajectory, per-vault staking, and on-chain proof — updating in real time.
          </p>
          <Link href="/dashboard"
            className="group inline-flex items-center gap-2 mt-7 px-7 py-3 font-mono text-[12px] font-bold uppercase tracking-widest transition-all hover:brightness-110"
            style={{ background: CYAN, color: "#00131a", clipPath: OCT, boxShadow: `0 0 30px ${CYAN}55` }}>
            Launch app
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <footer className="mt-12 flex justify-center font-mono text-[9px] text-cyber-muted/40">
          AGENT-CASPER — Casper Agentic Buildathon 2026
        </footer>
      </section>
    </main>
  );
}
