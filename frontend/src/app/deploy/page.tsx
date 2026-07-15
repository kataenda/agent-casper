"use client";

/**
 * /deploy — focused admin menu to deploy the (payable) YieldVault and register
 * the agent, styled to match /x402 and /swap. Reuses DeployPanel + RegisterAgentButton.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, CheckCircle2, AlertTriangle, RefreshCw, Rocket, ExternalLink, Wallet } from "lucide-react";
import { useWalletVault } from "@/lib/walletVault";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ACCENT = "#FFB347";
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
const WalletWidget = dynamic(
  () => import("@/components/WalletWidget").then((m) => ({ default: m.WalletWidget })),
  { ssr: false, loading: () => <Placeholder label="wallet…" /> },
);

function Placeholder({ label }: { label: string }) {
  return <div className="font-mono text-[11px] text-white/40 py-2">{label}</div>;
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-5" style={{ background: "#0A0E14", border: `1px solid ${ACCENT}22`, clipPath: CLIP }}>
      {children}
    </div>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-bold"
      style={{ background: `${ACCENT}22`, color: ACCENT }}>{n}</span>
  );
}

interface Status {
  backendUpdated: boolean | null;
  contractHash: string | null;
  deployed: boolean;
  isPayable: boolean | null;
}

export default function DeployMenu() {
  const [s, setS] = useState<Status>({ backendUpdated: null, contractHash: null, deployed: false, isPayable: null });
  const [loading, setLoading] = useState(false);
  // The connected wallet's own vault — used only to show a "View your vault" link
  // (the full My Vault dashboard lives on /vault).
  const { vaultHash: walletVault } = useWalletVault();

  const refresh = async () => {
    setLoading(true);
    try {
      // Backend "updated" = the /vault/proxy-wasm route exists. It returns 200 (file
      // present) OR 404 with a "proxy_caller.wasm not present" detail (route exists,
      // file missing) — both mean the new code is live. A plain 404 = old backend.
      const info = await fetch(`${API}/admin/contract-info`).then((r) => r.json()).catch(() => ({}));
      let backendUpdated = false;
      try {
        const pr = await fetch(`${API}/vault/proxy-wasm`);
        if (pr.status === 200) backendUpdated = true;
        else if (pr.status === 404) {
          const j = await pr.json().catch(() => ({}));
          backendUpdated = typeof j?.detail === "string" && j.detail.includes("proxy_caller");
        }
      } catch { /* backend unreachable */ }

      const hash = (info?.vault_contract_hash || "").replace(/^hash-/, "");
      setS({
        backendUpdated,
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
    <div className="min-h-screen px-4 py-4 md:px-8 md:py-6" style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* ── Top bar (matches /x402 · /swap) ─────────────────────── */}
      <header className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Link href="/dashboard"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-mono text-[10px] uppercase tracking-widest transition-opacity hover:opacity-70"
                style={{ borderColor: "rgba(0,245,255,0.35)", color: "#00F5FF", background: "rgba(0,245,255,0.06)" }}>
            <ArrowLeft size={12} /> Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <Rocket size={18} style={{ color: ACCENT, filter: `drop-shadow(0 0 8px ${ACCENT})` }} />
            <div>
              <h1 className="font-mono font-bold uppercase tracking-[0.15em] text-sm" style={{ color: ACCENT }}>
                Deploy · YieldVault
              </h1>
              <p className="text-[9px] font-mono text-cyber-muted uppercase tracking-[0.15em]">
                Real-custody payable vault · from your wallet, no CLI
              </p>
            </div>
          </div>
        </div>
        <WalletWidget />
      </header>

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

      {/* My Vault dashboard lives on its own page (/vault) — link there instead of duplicating it. */}
      {walletVault && (
        <Link href="/vault" className="mt-4 inline-flex items-center gap-1.5 font-mono text-[10px] hover:opacity-80"
              style={{ color: "#00D4FF" }}>
          <Wallet size={12} /> View your vault — assets, staking &amp; swap history →
        </Link>
      )}

      {/* ── Step 1: deploy ─────────────────────────────────────── */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-2">
          <StepBadge n={1} />
          <span className="font-mono text-[12px] font-bold">Deploy the contract</span>
        </div>
        {s.backendUpdated === false && (
          <div className="mb-3 flex items-start gap-2 p-2 font-mono text-[10px]"
            style={{ background: "#2A1A0A", border: "1px solid #FFB02255", color: "#FFB877" }}>
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            Backend still serves the old wasm. Redeploy the backend on Coolify, hit refresh, then deploy.
          </div>
        )}
        {/* Set expectations BEFORE the wallet pops up: Casper Wallet cannot read raw
            WASM, so every contract deploy looks alarming. Explaining it up front is
            the difference between a user signing and a user backing out. */}
        <div className="mb-3 flex items-start gap-2 p-2.5 font-mono text-[10px] leading-relaxed"
          style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.25)", color: "#9fdcff" }}>
          <AlertTriangle size={12} className="mt-0.5 shrink-0" style={{ color: "#00D4FF" }} />
          <span>
            <b className="text-white">Your wallet will show a “WASM transaction” warning — that is normal.</b>{" "}
            Deploying a contract means sending raw bytecode, which Casper Wallet cannot decode, so it always
            asks you to acknowledge the risk. You are deploying <b className="text-white">your own YieldVault</b>{" "}
            (Odra, named key <code>yield_vault_prod</code>, gas ~230 CSPR). Everything afterwards —
            deposit, withdraw, register — is a normal contract call and displays the entry point in plain text.
          </span>
        </div>
        <Panel><DeployPanel /></Panel>
        <p className="mt-2 font-mono text-[9px] text-white/40">
          Connect your wallet (top-right) with testnet CSPR, then click <b>Deploy New (payable)</b>.
        </p>
      </div>

      {/* ── Step 2: register ───────────────────────────────────── */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-2">
          <StepBadge n={2} />
          <span className="font-mono text-[12px] font-bold">Register the agent</span>
        </div>
        <Panel><RegisterAgentButton contractHash={s.contractHash || ""} /></Panel>
        <p className="mt-3 mb-10 font-mono text-[9px] text-white/40">
          That&apos;s it — your vault is resolved on-chain automatically (no env/config needed).
          Deposit from the dashboard and the agent services your vault from the next cycle.
        </p>
      </div>
    </div>
  );
}

function StatusRow({ ok, good, bad, pending }: { ok: boolean | null; good: string; bad: string; pending: string }) {
  if (ok === null) return <div className="flex items-center gap-2 py-1 font-mono text-[11px] text-white/40"><RefreshCw size={12} className="animate-spin" /> {pending}</div>;
  return (
    <div className="flex items-center gap-2 py-1 font-mono text-[11px]">
      {ok
        ? <CheckCircle2 size={13} style={{ color: "#00FF94" }} />
        : <AlertTriangle size={13} style={{ color: "#FFB022" }} />}
      <span className={ok ? "text-white/80" : "text-white/60"}>{ok ? good : bad}</span>
    </div>
  );
}
