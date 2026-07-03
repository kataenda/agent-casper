"use client";

/**
 * VaultControls — Register agent + deposit CSPR into YieldVault.
 * Both actions use the connected Casper Wallet to sign deploys.
 * Submit flow mirrors DeployPanel: try anonymous browser → node first (avoids
 * org API-key rate limit), fallback to backend /rpc proxy.
 */

import { useState, useEffect } from "react";
import { UserPlus, ArrowDownCircle, Loader, CheckCircle, AlertCircle, ExternalLink } from "lucide-react";
import { useWalletStore } from "@/lib/walletStore";
import { useAgentStore } from "@/lib/store";
import { buildDepositDeploy, isRealVaultEnabled } from "@/lib/vaultDeposit";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const CHAIN   = "casper-test";
const GAS     = "2500000000"; // 2.5 CSPR

type Step = "idle" | "building" | "signing" | "submitting" | "done" | "error";

const STEP_LABEL: Record<Step, string> = {
  idle: "", building: "Building deploy…", signing: "Waiting for signature…",
  submitting: "Submitting to testnet…", done: "Done!", error: "Error",
};

// ── Deploy submission — anonymous browser first, then backend fallback ─────────

async function submitDeploy(deployBody: string): Promise<string> {
  const rpcRes = await fetch(`${BACKEND}/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: deployBody,
  });
  const rpcData = await rpcRes.json();
  if (!rpcRes.ok) throw new Error(
    `HTTP ${rpcRes.status}: ${rpcData.detail ?? JSON.stringify(rpcData).slice(0, 200)}`
  );
  if (rpcData.error) throw new Error(
    `Node: ${rpcData.error.message}${rpcData.error.data ? ` — ${rpcData.error.data}` : ""}`
  );
  if (!rpcData.result?.deploy_hash) throw new Error(
    `RPC: ${JSON.stringify(rpcData).slice(0, 200)}`
  );
  return rpcData.result.deploy_hash as string;
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

async function buildStoredContractSession(
  contractHash: string,
  entryPoint: string,
  argsMap: Record<string, unknown>,
) {
  const sdk = await import("casper-js-sdk") as any;
  const { ExecutableDeployItem, StoredVersionedContractByHash, ContractHash, Hash, Args } = sdk;

  const hashHex = contractHash.replace(/^(hash-|package-|contract-)/, "");
  const hashObj = Hash.fromHex(hashHex);
  const chash   = new ContractHash(hashObj, "hash-");
  const stored  = new StoredVersionedContractByHash(chash, entryPoint, Args.fromMap(argsMap));
  const item    = new ExecutableDeployItem();
  item.storedVersionedContractByHash = stored;
  return { item, sdk };
}

async function signDeploy(deploy: unknown, publicKey: string, sdk: any): Promise<string> {
  const provider = (window as any).CasperWalletProvider?.();
  if (!provider) throw new Error("Casper Wallet tidak ditemukan");

  const { Deploy } = sdk;
  const signResult = await provider.sign(JSON.stringify(Deploy.toJSON(deploy)), publicKey);
  if (signResult?.cancelled) throw new Error("Dibatalkan");

  let signedJson: any;
  if (signResult?.deploy) {
    signedJson = typeof signResult.deploy === "string"
      ? JSON.parse(signResult.deploy) : signResult.deploy;
  } else {
    let sigHex = (signResult?.signatureHex ?? signResult?.signature ?? "") as string;
    if (sigHex.length === 128)
      sigHex = (publicKey.startsWith("02") ? "02" : "01") + sigHex;
    const pubKey = sdk.PublicKey.fromHex(publicKey);
    signedJson = Deploy.toJSON(Deploy.setSignature(
      deploy, Uint8Array.from(Buffer.from(sigHex, "hex")), pubKey,
    ));
  }

  // Strip hash- prefix from session hash (node expects raw 64-char hex)
  for (const key of ["StoredContractByHash", "StoredVersionedContractByHash"]) {
    const s = signedJson?.session?.[key];
    if (s?.hash && typeof s.hash === "string")
      s.hash = s.hash.replace(/^(hash-|package-|contract-)/, "");
  }

  return JSON.stringify({
    id: 1, jsonrpc: "2.0",
    method: "account_put_deploy",
    params: { deploy: signedJson },
  });
}

// ── Register Agent ─────────────────────────────────────────────────────────────

export function RegisterAgentButton({ contractHash }: { contractHash: string }) {
  const { account, setAgentRegistered } = useWalletStore();
  const [step, setStep]     = useState<Step>("idle");
  const [error, setError]   = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  // On-chain registration status — avoids re-registering (and paying gas) on every
  // wallet connect. Read from the vault's latest register_agent deploy, not a local flag.
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [registeredUrl, setRegisteredUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!contractHash) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${BACKEND}/vault/agent-registered`);
        const d = await r.json();
        if (!cancelled && d.registered && d.matches_current) {
          setAlreadyRegistered(true);
          setRegisteredUrl(d.explorer_url ?? null);
          setAgentRegistered(true);
        }
      } catch { /* indexer unreachable — fall back to manual register button */ }
    })();
    return () => { cancelled = true; };
  }, [contractHash, setAgentRegistered]);

  const doRegister = async () => {
    if (!account || !contractHash) return;
    setStep("building"); setError(null);

    try {
      const agentRes  = await fetch(`${BACKEND}/admin/agent-address`);
      const agentData = await agentRes.json();
      const agentHash: string = agentData.agent_account_hash ?? "";
      if (!agentHash) throw new Error("Agent address tidak ditemukan");

      const sdk = await import("casper-js-sdk") as any;
      const { Deploy, DeployHeader, ExecutableDeployItem, PublicKey, Duration, Timestamp, CLValue, Key } = sdk;

      const agentKeyArg = CLValue.newCLKey(Key.newKey(agentHash));
      const { item: session } = await buildStoredContractSession(
        contractHash, "register_agent", { "agent": agentKeyArg },
      );

      const pubKey = PublicKey.fromHex(account.publicKey);
      const header = new DeployHeader();
      header.account = pubKey; header.chainName = CHAIN;
      header.gasPrice = 1; header.ttl = new Duration(1800000);
      header.timestamp = new Timestamp(new Date()); header.dependencies = [];

      const deploy = Deploy.makeDeploy(header, ExecutableDeployItem.standardPayment(GAS), session);

      setStep("signing");
      const deployBody = await signDeploy(deploy, account.publicKey, sdk);

      setStep("submitting");
      const hash = await submitDeploy(deployBody);
      setTxHash(hash);
      setAgentRegistered(true);
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  };

  if (step === "done" && txHash) return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border"
           style={{ borderColor: "rgba(0,255,148,0.35)", background: "rgba(0,255,148,0.06)" }}>
        <CheckCircle size={11} style={{ color: "#00FF94", flexShrink: 0 }} />
        <span className="text-[10px] font-mono font-bold" style={{ color: "#00FF94" }}>AGENT REGISTERED</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border"
           style={{ borderColor: "rgba(0,245,255,0.2)", background: "rgba(0,245,255,0.04)" }}>
        <span className="text-[9px] font-mono text-cyber-muted shrink-0">TX</span>
        <span className="text-[9px] font-mono truncate max-w-[160px]"
              style={{ color: "#00F5FF" }} title={txHash}>
          {txHash.slice(0, 20)}…
        </span>
        <a href={`https://testnet.cspr.live/deploy/${txHash}`}
           target="_blank" rel="noopener noreferrer"
           className="ml-auto hover:opacity-75 transition-opacity shrink-0"
           title="View on testnet.cspr.live">
          <ExternalLink size={10} style={{ color: "#00F5FF" }} />
        </a>
      </div>
    </div>
  );

  // Already registered on-chain (detected on load) — no need to register again.
  // Clickable when we have the register_agent deploy hash, so the owner can verify it.
  if (alreadyRegistered) {
    const Badge = (
      <>
        <CheckCircle size={11} style={{ color: "#00FF94", flexShrink: 0 }} />
        <span className="text-[10px] font-mono font-bold" style={{ color: "#00FF94" }}>AGENT REGISTERED</span>
        <span className="text-[8px] font-mono text-cyber-muted">on-chain</span>
        {registeredUrl && <ExternalLink size={10} style={{ color: "#00F5FF" }} className="ml-auto shrink-0" />}
      </>
    );
    const cls = "flex items-center gap-2 px-3 py-1.5 rounded-xl border";
    const st  = { borderColor: "rgba(0,255,148,0.35)", background: "rgba(0,255,148,0.06)" };
    return registeredUrl ? (
      <a href={registeredUrl} target="_blank" rel="noopener noreferrer"
         className={`${cls} hover:opacity-80 transition-opacity`} style={st}
         title="View register_agent tx on testnet.cspr.live">{Badge}</a>
    ) : (
      <div className={cls} style={st}>{Badge}</div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {step !== "idle" && step !== "error" && (
        <span className="flex items-center gap-1.5 text-[9px] font-mono text-cyber-muted">
          <Loader size={9} className="animate-spin" />{STEP_LABEL[step]}
        </span>
      )}
      {step === "error" && error && (
        <span className="flex items-center gap-1 text-[9px] font-mono text-red-400 max-w-[200px] truncate" title={error}>
          <AlertCircle size={9} />{error.slice(0, 50)}
        </span>
      )}
      <button onClick={doRegister}
        disabled={!account || !contractHash || (step !== "idle" && step !== "error")}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-widest transition-all duration-300 disabled:opacity-30"
        style={{ background: "rgba(0,255,148,0.06)", borderColor: "rgba(0,255,148,0.35)", color: "#00FF94" }}>
        <UserPlus size={10} />
        {step === "error" ? "Retry Register" : "Register Agent"}
      </button>
    </div>
  );
}

// ── Deposit ────────────────────────────────────────────────────────────────────

export function DepositButton({ contractHash }: { contractHash: string }) {
  const { account }              = useWalletStore();
  const { addDeposit, addVaultTx } = useAgentStore();
  const [step, setStep]          = useState<Step>("idle");
  const [error, setError]        = useState<string | null>(null);
  const [txHash, setTxHash]      = useState<string | null>(null);
  const [amount, setAmount]      = useState("100");

  const doDeposit = async () => {
    if (!account) return;
    setStep("building"); setError(null);

    try {
      const amountMotes = BigInt(Math.floor(parseFloat(amount) * 1_000_000_000));
      let deploy: unknown;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let sdk: any;

      if (isRealVaultEnabled()) {
        // Real custody: attach CSPR to the vault's payable deposit() via the Odra
        // proxy caller — funds land in the contract purse, not the agent account.
        ({ deploy, sdk } = await buildDepositDeploy(account.publicKey, amount));
      } else {
        // Fallback (pre-payable vault): native transfer to the agent account.
        const agentRes  = await fetch(`${BACKEND}/admin/agent-address`);
        const agentData = await agentRes.json();
        const agentPubKey: string = agentData.agent_public_key ?? "";
        if (!agentPubKey) throw new Error("Agent public key tidak ditemukan");

        sdk = await import("casper-js-sdk") as any;
        const { Deploy, DeployHeader, ExecutableDeployItem, PublicKey, Duration, Timestamp, TransferDeployItem } = sdk;
        const agentKey   = PublicKey.fromHex(agentPubKey);
        const xfer       = TransferDeployItem.newTransfer(String(amountMotes), agentKey, null, 1);
        const session    = new ExecutableDeployItem();
        session.transfer = xfer;

        const pubKey = PublicKey.fromHex(account.publicKey);
        const header = new DeployHeader();
        header.account = pubKey; header.chainName = CHAIN;
        header.gasPrice = 1; header.ttl = new Duration(1800000);
        header.timestamp = new Timestamp(new Date()); header.dependencies = [];
        deploy = Deploy.makeDeploy(header, ExecutableDeployItem.standardPayment(GAS), session);
      }

      setStep("signing");
      const deployBody = await signDeploy(deploy, account.publicKey, sdk);

      setStep("submitting");
      const hash = await submitDeploy(deployBody);
      setTxHash(hash);
      addDeposit(Number(amountMotes));
      addVaultTx({ type: "deposit", amount, hash, ts: Date.now() });
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  };

  if (step === "done" && txHash) return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border"
         style={{ borderColor: "rgba(0,212,255,0.35)", background: "rgba(0,212,255,0.06)" }}>
      <CheckCircle size={10} style={{ color: "#00D4FF" }} />
      <span className="text-[10px] font-mono font-bold" style={{ color: "#00D4FF" }}>DEPOSITED {amount} CSPR</span>
      <span className="text-[9px] font-mono text-cyber-muted ml-1">{txHash.slice(0, 14)}…</span>
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      {step !== "idle" && step !== "error" && (
        <span className="flex items-center gap-1.5 text-[9px] font-mono text-cyber-muted">
          <Loader size={9} className="animate-spin" />{STEP_LABEL[step]}
        </span>
      )}
      {step === "error" && error && (
        <span className="flex items-center gap-1 text-[9px] font-mono text-red-400 max-w-[200px] truncate" title={error}>
          <AlertCircle size={9} />{error.slice(0, 50)}
        </span>
      )}
      <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
        disabled={step !== "idle" && step !== "error"}
        className="w-14 px-2 py-1 rounded border bg-transparent text-[9px] font-mono text-center disabled:opacity-30"
        style={{ borderColor: "rgba(0,212,255,0.3)", color: "#00D4FF" }}
        min="1" step="10" />
      <span className="text-[9px] font-mono text-cyber-muted">CSPR</span>
      <button onClick={doDeposit}
        disabled={!account || !contractHash || (step !== "idle" && step !== "error")}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-widest transition-all duration-300 disabled:opacity-30"
        style={{ background: "rgba(0,212,255,0.06)", borderColor: "rgba(0,212,255,0.35)", color: "#00D4FF" }}>
        <ArrowDownCircle size={10} />
        {step === "error" ? "Retry Deposit" : "Deposit"}
      </button>
    </div>
  );
}
