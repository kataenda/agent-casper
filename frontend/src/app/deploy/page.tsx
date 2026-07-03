"use client";

/**
 * /deploy — a focused admin menu for deploying the (payable) YieldVault and
 * registering the agent, with live status so you know exactly what state you're in.
 * The heavy lifting is reused from DeployPanel + RegisterAgentButton.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, CheckCircle2, AlertTriangle, RefreshCw, Rocket, UserPlus, ExternalLink } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ACCENT = "#00FF94";
const CLIP = "polygon(14px 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%,0 14px)";
// The pre-custody contract. If the live hash still equals this, the payable vault
// hasn't been deployed yet.
const OLD_HASH = "f6ba9dfa2a236dcc253436c3350f06931465ca94290fad689dfc7c9058c559da";

const DeployPanel = dynamic(
  () => import("@/components/DeployPanel").then((m) => ({ default: m.DeployPanel })),
  { ssr: false, loading: () => <Placeholder label="Loading deploy panel…" /> },
);
const RegisterAgentButton = dynamic(
  () => import("@/components/VaultControls").then((m) => ({ default: m.RegisterAgentButton })),
  { ssr: false, loading: () => <Placeholder label="Loading register…" /> },
);

function Placeholder({ label }: { label: string }) {
  return <div className="font-mono text-[11px] text-white/40 py-4">{label}</div>;
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-5" style={{ background: "#0A0E14", border: `1px solid ${ACCENT}22`, clipPath: CLIP }}>
      {children}
    </div>
  );
}

interface Status {
  backendUpdated: boolean | null; // proxy-wasm endpoint present (new code live)
  contractHash: string | null;
  deployed: boolean;
  isPayable: boolean | null;      // hash differs from OLD_HASH
}

export default function DeployMenu() {
  const [s, setS] = useState<Status>({ backendUpdated: null, contractHash: null, deployed: false, isPayable: null });
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [info, proxy] = await Promise.all([
        fetch(`${API}/admin/contract-info`).then((r) => r.json()).catch(() => ({})),
        fetch(`${API}/vault/proxy-wasm`).then((r) => r.status).catch(() => 0),
      ]);
      const hash = (info?.vault_contract_hash || "").replace(/^hash-/, "");
      setS({
        backendUpdated: proxy === 200,
        contractHash: info?.vault_contract_hash || null,
        deployed: !!info?.contract_deployed,
        isPayable: hash ? hash !== OLD_HASH : null,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  return (
    <main className="min-h-screen bg-black text-white px-4 py-8 md:px-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-1.5 font-mono text-[11px] text-white/50 hover:text-white mb-6">
          <ArrowLeft size={12} /> back to dashboard
        </Link>

        <div className="flex items-center gap-2 mb-1">
          <Rocket size={18} style={{ color: ACCENT }} />
          <h1 className="font-mono text-lg font-bold tracking-wide">Deploy YieldVault</h1>
        </div>
        <p className="font-mono text-[11px] text-white/50 mb-6">
          Deploy the real-custody (payable) vault and register the agent — all from your wallet, no CLI.
        </p>

        {/* ── Live status ─────────────────────────────────────────── */}
        <Panel>
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-white/50">Status</span>
            <button onClick={refresh} disabled={loading}
              className="inline-flex items-center gap-1 font-mono text-[10px] text-white/60 hover:text-white disabled:opacity-40">
              <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> refresh
            </button>
          </div>
          <StatusRow ok={s.backendUpdated}
            good="Backend updated (new code live)"
            bad="Backend NOT updated yet — redeploy backend on Coolify first"
            pending="checking backend…" />
          <StatusRow ok={s.deployed}
            good="A contract is deployed"
            bad="No contract deployed yet"
            pending="checking contract…" />
          <StatusRow ok={s.isPayable}
            good="Deployed contract is the NEW payable vault"
            bad="Still the pre-custody contract — deploy the payable one below"
            pending="checking contract version…" />
          {s.contractHash && (
            <a href={`https://testnet.cspr.live/contract-package/${s.contractHash.replace(/^hash-/, "")}`}
              target="_blank" rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] break-all"
              style={{ color: "#00D4FF" }}>
              {s.contractHash} <ExternalLink size={9} />
            </a>
          )}
        </Panel>

        {/* ── Step 1: deploy ─────────────────────────────────────── */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-bold"
              style={{ background: `${ACCENT}22`, color: ACCENT }}>1</span>
            <span className="font-mono text-[12px] font-bold">Deploy the contract</span>
          </div>
          {s.backendUpdated === false && (
            <div className="mb-3 flex items-start gap-2 p-2 font-mono text-[10px]"
              style={{ background: "#2A1A0A", border: "1px solid #FFB02255", color: "#FFB877" }}>
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              Backend still serves the old wasm. Redeploy the backend on Coolify, hit refresh, then deploy.
            </div>
          )}
          <Panel><DeployPanel /></Panel>
        </div>

        {/* ── Step 2: register ───────────────────────────────────── */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-bold"
              style={{ background: `${ACCENT}22`, color: ACCENT }}>2</span>
            <span className="font-mono text-[12px] font-bold">Register the agent</span>
            <UserPlus size={12} className="text-white/40" />
          </div>
          <Panel><RegisterAgentButton contractHash={s.contractHash || ""} /></Panel>
        </div>

        {/* ── Step 3: hand off ───────────────────────────────────── */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-bold"
              style={{ background: `${ACCENT}22`, color: ACCENT }}>3</span>
            <span className="font-mono text-[12px] font-bold">Set env + wire the UI</span>
          </div>
          <Panel>
            <p className="font-mono text-[11px] text-white/60 leading-relaxed">
              After deploy, copy the new contract hash above and set:
            </p>
            <pre className="mt-2 overflow-x-auto p-2 font-mono text-[10px] text-white/80"
              style={{ background: "#05080C", border: `1px solid ${ACCENT}18` }}>
{`VAULT_CONTRACT_HASH=<new hash>          # backend + Coolify
NEXT_PUBLIC_VAULT_PACKAGE_HASH=<new hash>  # frontend`}
            </pre>
            <p className="mt-2 font-mono text-[10px] text-white/40">
              Then the deposit/withdraw builders in <code>lib/vaultDeposit.ts</code> activate.
              See <code>docs/REAL_CUSTODY.md</code>.
            </p>
          </Panel>
        </div>
      </div>
    </main>
  );
}

function StatusRow({ ok, good, bad, pending }: { ok: boolean | null; good: string; bad: string; pending: string }) {
  if (ok === null) return <div className="flex items-center gap-2 py-1 font-mono text-[11px] text-white/40"><RefreshCw size={12} className="animate-spin" /> {pending}</div>;
  return (
    <div className="flex items-center gap-2 py-1 font-mono text-[11px]">
      {ok
        ? <CheckCircle2 size={13} style={{ color: ACCENT }} />
        : <AlertTriangle size={13} style={{ color: "#FFB022" }} />}
      <span className={ok ? "text-white/80" : "text-white/60"}>{ok ? good : bad}</span>
    </div>
  );
}
