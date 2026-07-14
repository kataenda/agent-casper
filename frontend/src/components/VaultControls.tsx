"use client";

/**
 * VaultControls — Register agent + deposit CSPR into YieldVault.
 * Both actions use the connected Casper Wallet to sign deploys.
 * Submit flow mirrors DeployPanel: try anonymous browser → node first (avoids
 * org API-key rate limit), fallback to backend /rpc proxy.
 */

import { useState, useEffect } from "react";
import { UserPlus, ArrowDownCircle, ArrowUpCircle, Loader, CheckCircle, AlertCircle, ExternalLink } from "lucide-react";
import { useWalletStore } from "@/lib/walletStore";
import { useAgentStore } from "@/lib/store";
import { buildDepositDeploy, buildWithdrawDeploy, buildOwnerCallDeploy, isRealVaultEnabled, DEPOSIT_GAS_MOTES } from "@/lib/vaultDeposit";
import { useWalletVault } from "@/lib/walletVault";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const CHAIN   = "casper-test";
const GAS     = "2500000000"; // 2.5 CSPR

type Step = "idle" | "building" | "signing" | "submitting" | "waiting" | "done" | "error";

const STEP_LABEL: Record<Step, string> = {
  idle: "", building: "Building deploy…", signing: "Waiting for signature…",
  submitting: "Submitting to testnet…", waiting: "Confirming on-chain (~1 min)…",
  done: "Done!", error: "Error",
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

/** The wallet's liquid CSPR (motes), or null when the read fails (don't block). */
async function getWalletBalanceMotes(publicKey: string): Promise<bigint | null> {
  try {
    const r = await fetch(`${BACKEND}/rpc`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1, jsonrpc: "2.0", method: "query_balance",
        params: { purse_identifier: { main_purse_under_public_key: publicKey } },
      }),
    });
    const d = await r.json();
    const b = d.result?.balance;
    return b ? BigInt(b) : null;
  } catch { return null; }
}

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
  // Wallet-scoped target: register on the CONNECTED wallet's own vault when it
  // has one (only its owner can call register_agent there); otherwise fall back
  // to the globally configured vault.
  const { vaultHash: walletVault } = useWalletVault();
  const targetHash = walletVault ?? contractHash;
  const [step, setStep]     = useState<Step>("idle");
  const [error, setError]   = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  // On-chain registration status — avoids re-registering (and paying gas) on every
  // wallet connect. Read from the vault's latest register_agent deploy, not a local flag.
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [registeredUrl, setRegisteredUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!targetHash) return;
    let cancelled = false;
    setAlreadyRegistered(false); setRegisteredUrl(null);
    (async () => {
      try {
        const pkg = targetHash.replace(/^(hash-|package-)/, "");
        const r = await fetch(`${BACKEND}/vault/agent-registered?package=${pkg}`);
        const d = await r.json();
        if (!cancelled && d.registered && d.matches_current) {
          setAlreadyRegistered(true);
          setRegisteredUrl(d.explorer_url ?? null);
          setAgentRegistered(true);
        }
      } catch { /* indexer unreachable — fall back to manual register button */ }
    })();
    return () => { cancelled = true; };
  }, [targetHash, setAgentRegistered]);

  const doRegister = async () => {
    if (!account || !targetHash) return;
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
        targetHash, "register_agent", { "agent": agentKeyArg },
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

      // No optimistic badge: wait for real on-chain execution before claiming
      // success — a reverted deploy must show as an error, not "REGISTERED".
      setStep("waiting");
      const deadline = Date.now() + 120_000;
      let confirmed = false; let chainErr: string | null = null;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 10_000));
        try {
          const res = await fetch(`${BACKEND}/deploys/${hash}`);
          const raw = await res.json();
          const o = raw.data ?? raw;
          if (o.error_message) { chainErr = String(o.error_message); break; }
          if (o.status && o.status !== "pending") { confirmed = true; break; }
        } catch { /* transient — keep polling */ }
      }
      if (chainErr) throw new Error(`On-chain failure: ${chainErr}`);
      if (!confirmed) throw new Error("Belum terkonfirmasi dalam 2 menit — cek explorer");

      // Bust the backend's cached view so a reload shows the truth immediately.
      try {
        const pkg = targetHash.replace(/^(hash-|package-)/, "");
        await fetch(`${BACKEND}/vault/agent-registered?package=${pkg}&fresh=1`);
      } catch { /* non-fatal */ }

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
        title={walletVault ? `Registers the agent on YOUR wallet's vault (${walletVault.slice(0, 18)}…)` : "Registers the agent on the configured vault"}
        disabled={!account || !targetHash || (step !== "idle" && step !== "error")}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-widest transition-all duration-300 disabled:opacity-30"
        style={{ background: "rgba(0,255,148,0.06)", borderColor: "rgba(0,255,148,0.35)", color: "#00FF94" }}>
        <UserPlus size={10} />
        {step === "error" ? "Retry Register" : "Register Agent"}
      </button>
    </div>
  );
}

// ── Deposit / Withdraw ─────────────────────────────────────────────────────────

type Mode = "deposit" | "withdraw";

export function DepositButton({ contractHash }: { contractHash: string }) {
  const { account }              = useWalletStore();
  const { addDeposit, addVaultTx } = useAgentStore();
  // Wallet-scoped target: deposit lands in the CONNECTED wallet's own vault when
  // it has one; otherwise the globally configured vault.
  const { vaultHash: walletVault } = useWalletVault();
  const [mode, setMode]          = useState<Mode>("deposit");
  const [step, setStep]          = useState<Step>("idle");
  const [error, setError]        = useState<string | null>(null);
  const [txHash, setTxHash]      = useState<string | null>(null);
  const [amount, setAmount]      = useState("100");
  // Liquid (instantly withdrawable) CSPR in the target vault — powers MAX and
  // guards against asking for more than the purse actually holds.
  const [liquid, setLiquid]      = useState<number | null>(null);

  const target = walletVault || contractHash;

  useEffect(() => {
    if (mode !== "withdraw" || !target) return;
    let alive = true;
    fetch(`${BACKEND}/vault/state?package=${encodeURIComponent(target)}`)
      .then(r => r.json())
      .then(d => { if (alive) setLiquid(typeof d?.liquid_cspr === "number" ? d.liquid_cspr : null); })
      .catch(() => { if (alive) setLiquid(null); });
    return () => { alive = false; };
  }, [mode, target, step]);

  const doDeposit = async () => {
    if (!account) return;
    setStep("building"); setError(null);

    try {
      const amountMotes = BigInt(Math.floor(parseFloat(amount) * 1_000_000_000));

      // Pre-flight: verify the wallet can cover deposit + gas BEFORE submitting,
      // so an underfunded attempt fails with a clear message instead of burning
      // the gas on an on-chain "Mint error: 0" (InsufficientFunds).
      const gasMotes = isRealVaultEnabled(walletVault) ? DEPOSIT_GAS_MOTES : BigInt(GAS);
      const balance = await getWalletBalanceMotes(account.publicKey);
      if (balance !== null && balance < amountMotes + gasMotes) {
        const have = (Number(balance) / 1e9).toFixed(2);
        const need = (Number(amountMotes + gasMotes) / 1e9).toFixed(0);
        throw new Error(`Saldo tidak cukup: ${have} CSPR tersedia — butuh ~${need} CSPR (deposit ${amount} + gas ${Number(gasMotes) / 1e9}). Kurangi jumlah atau isi saldo.`);
      }

      let deploy: unknown;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let sdk: any;

      if (isRealVaultEnabled(walletVault)) {
        // Real custody: attach CSPR to the vault's payable deposit() via the Odra
        // proxy caller — funds land in the TARGET vault's contract purse (the
        // connected wallet's own vault when it has one).
        ({ deploy, sdk } = await buildDepositDeploy(account.publicKey, amount, walletVault));
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

      // Honest status: wait for on-chain execution before claiming DEPOSITED —
      // a reverted deploy (e.g. insufficient funds) must surface as an error.
      setStep("waiting");
      const deadline = Date.now() + 120_000;
      let confirmed = false; let chainErr: string | null = null;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 10_000));
        try {
          const res = await fetch(`${BACKEND}/deploys/${hash}`);
          const raw = await res.json();
          const o = raw.data ?? raw;
          if (o.error_message) { chainErr = String(o.error_message); break; }
          if (o.status && o.status !== "pending") { confirmed = true; break; }
        } catch { /* transient — keep polling */ }
      }
      if (chainErr) {
        const friendly = chainErr.includes("Mint error: 0")
          ? "Saldo tidak cukup di on-chain (Mint InsufficientFunds) — kurangi jumlah deposit."
          : chainErr;
        throw new Error(`On-chain failure: ${friendly}`);
      }
      if (!confirmed) throw new Error("Belum terkonfirmasi dalam 2 menit — cek explorer");

      addDeposit(Number(amountMotes));
      addVaultTx({ type: "deposit", amount, hash, ts: Date.now() });
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  };

  const doWithdraw = async () => {
    if (!account) return;
    setStep("building"); setError(null);

    try {
      const want = parseFloat(amount);
      if (!(want > 0)) throw new Error("Masukkan jumlah lebih dari 0");
      if (liquid !== null && want > liquid)
        throw new Error(`Vault hanya punya ${liquid} CSPR likuid — kurangi jumlahnya`);

      // withdraw() is a NORMAL (non-payable) call: the CSPR comes out of the vault
      // purse, so the wallet only needs to cover gas.
      const balance = await getWalletBalanceMotes(account.publicKey);
      if (balance !== null && balance < BigInt(GAS))
        throw new Error(`Saldo wallet kurang untuk gas (~${Number(GAS) / 1e9} CSPR)`);

      const { deploy, sdk } = await buildWithdrawDeploy(account.publicKey, amount, walletVault);

      setStep("signing");
      const deployBody = await signDeploy(deploy, account.publicKey, sdk);

      setStep("submitting");
      const hash = await submitDeploy(deployBody);
      setTxHash(hash);

      // Honest status: only claim WITHDRAWN after the deploy executes successfully.
      setStep("waiting");
      const deadline = Date.now() + 120_000;
      let confirmed = false; let chainErr: string | null = null;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 10_000));
        try {
          const res = await fetch(`${BACKEND}/deploys/${hash}`);
          const raw = await res.json();
          const o = raw.data ?? raw;
          if (o.error_message) { chainErr = String(o.error_message); break; }
          if (o.status && o.status !== "pending") { confirmed = true; break; }
        } catch { /* transient — keep polling */ }
      }
      if (chainErr) throw new Error(`On-chain failure: ${chainErr}`);
      if (!confirmed) throw new Error("Belum terkonfirmasi dalam 2 menit — cek explorer");

      addVaultTx({ type: "withdraw", amount, hash, ts: Date.now() });
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  };

  const isWd  = mode === "withdraw";
  const busy  = step !== "idle" && step !== "error";
  const tint  = isWd ? "#FFB347" : "#00D4FF";   // withdraw = amber, deposit = cyan

  if (step === "done" && txHash) return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border"
         style={{ borderColor: `${tint}59`, background: `${tint}0F` }}>
      <CheckCircle size={10} style={{ color: tint }} />
      <span className="text-[10px] font-mono font-bold" style={{ color: tint }}>
        {isWd ? "WITHDRAWN" : "DEPOSITED"} {amount} CSPR
      </span>
      <span className="text-[9px] font-mono text-cyber-muted ml-1">{txHash.slice(0, 14)}…</span>
      <button onClick={() => { setStep("idle"); setTxHash(null); }}
        className="ml-1 text-[9px] font-mono text-cyber-muted hover:text-white">↺</button>
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      {/* Deposit | Withdraw tabs — a vault you can only pay INTO is a red flag. */}
      <div className="flex items-center gap-1">
        {(["deposit", "withdraw"] as Mode[]).map((m) => {
          const on = mode === m;
          const c  = m === "withdraw" ? "#FFB347" : "#00D4FF";
          return (
            <button key={m} onClick={() => { if (!busy) { setMode(m); setError(null); setStep("idle"); } }}
              disabled={busy}
              className="px-2.5 py-1 rounded border text-[9px] font-mono font-bold uppercase tracking-widest transition-all disabled:opacity-30"
              style={{
                background: on ? `${c}14` : "transparent",
                borderColor: on ? `${c}59` : "rgba(255,255,255,0.12)",
                color: on ? c : "rgba(255,255,255,0.45)",
              }}>
              {m}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        {busy && (
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
          disabled={busy}
          className="w-14 px-2 py-1 rounded border bg-transparent text-[9px] font-mono text-center disabled:opacity-30"
          style={{ borderColor: `${tint}4D`, color: tint }}
          min="1" step="10" />
        <span className="text-[9px] font-mono text-cyber-muted">CSPR</span>

        {isWd && liquid !== null && (
          <button onClick={() => setAmount(String(liquid))} disabled={busy || liquid <= 0}
            className="px-1.5 py-1 rounded border text-[9px] font-mono uppercase disabled:opacity-30"
            style={{ borderColor: "#FFB3474D", color: "#FFB347" }}>
            max
          </button>
        )}

        <button onClick={isWd ? doWithdraw : doDeposit}
          title={walletVault
            ? `${isWd ? "Withdraws from" : "Deposits into"} YOUR wallet's vault (${walletVault.slice(0, 18)}…)`
            : `${isWd ? "Withdraws from" : "Deposits into"} the configured vault`}
          disabled={!account || !target || busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-widest transition-all duration-300 disabled:opacity-30"
          style={{ background: `${tint}0F`, borderColor: `${tint}59`, color: tint }}>
          {isWd ? <ArrowUpCircle size={10} /> : <ArrowDownCircle size={10} />}
          {step === "error" ? (isWd ? "Retry Withdraw" : "Retry Deposit") : (isWd ? "Withdraw" : "Deposit")}
        </button>
      </div>

      {isWd && (
        <span className="text-[9px] font-mono text-cyber-muted">
          {liquid === null
            ? "reading vault balance…"
            : `available: ${liquid.toLocaleString()} CSPR liquid · instant · gas ~${Number(GAS) / 1e9} CSPR`}
        </span>
      )}
    </div>
  );
}

// ── Danger Zone — owner-only emergency pause / resume ──────────────────────────

/**
 * Renders NOTHING unless the connected wallet is the vault's on-chain owner
 * (`register_agent` caller). `emergency_pause()` is an only_owner entry point, so
 * a non-owner press would revert on-chain anyway — we hide it to keep the UI honest.
 */
export function EmergencyPausePanel({ packageHash, ownerPublicKey }:
  { packageHash: string; ownerPublicKey: string }) {
  const { account } = useWalletStore();
  const [step, setStep]     = useState<Step>("idle");
  const [error, setError]   = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");

  const isOwner = !!account && !!ownerPublicKey &&
    account.publicKey.toLowerCase() === ownerPublicKey.toLowerCase();
  if (!isOwner) return null;

  const busy = step !== "idle" && step !== "error";

  const run = async (entryPoint: "emergency_pause" | "resume") => {
    if (!account) return;
    setStep("building"); setError(null); setTxHash(null);
    try {
      const { deploy, sdk } = await buildOwnerCallDeploy(account.publicKey, entryPoint, packageHash);
      setStep("signing");
      const body = await signDeploy(deploy, account.publicKey, sdk);
      setStep("submitting");
      const hash = await submitDeploy(body);
      setTxHash(hash);

      setStep("waiting");
      const deadline = Date.now() + 120_000;
      let confirmed = false; let chainErr: string | null = null;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 10_000));
        try {
          const res = await fetch(`${BACKEND}/deploys/${hash}`);
          const raw = await res.json();
          const o = raw.data ?? raw;
          if (o.error_message) { chainErr = String(o.error_message); break; }
          if (o.status && o.status !== "pending") { confirmed = true; break; }
        } catch { /* transient — keep polling */ }
      }
      if (chainErr) throw new Error(`On-chain failure: ${chainErr}`);
      if (!confirmed) throw new Error("Belum terkonfirmasi dalam 2 menit — cek explorer");

      setStep("done");
      setConfirm("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  };

  const RED = "#FF4D5E";

  return (
    <div className="p-4 mt-6" style={{ background: "#170A0C", border: `1px solid ${RED}3D` }}>
      <div className="flex items-center gap-2 mb-1">
        <AlertCircle size={13} style={{ color: RED }} />
        <span className="font-mono text-[11px] font-bold uppercase tracking-widest" style={{ color: RED }}>
          Danger Zone
        </span>
        <span className="font-mono text-[9px] text-white/35">owner-only · on-chain</span>
      </div>
      <p className="font-mono text-[10px] text-white/50 leading-relaxed mb-3">
        <b className="text-white/75">Emergency Pause</b> halts every agent action on this vault
        (<span className="text-white/40">rebalance · stake · fee sweep</span>). Your funds stay in the
        contract purse and remain withdrawable. Reversible with <b className="text-white/75">Resume</b>.
      </p>

      {step === "done" && txHash ? (
        <div className="flex items-center gap-2 font-mono text-[10px]" style={{ color: RED }}>
          <CheckCircle size={11} /> submitted
          <a href={`https://testnet.cspr.live/deploy/${txHash}`} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1 underline" style={{ color: "#00D4FF" }}>
            {txHash.slice(0, 16)}… <ExternalLink size={9} />
          </a>
          <button onClick={() => { setStep("idle"); setTxHash(null); }}
            className="ml-1 text-white/40 hover:text-white">↺</button>
        </div>
      ) : (
        <>
          <label className="block font-mono text-[9px] uppercase tracking-widest text-white/40 mb-1">
            type <b style={{ color: RED }}>PAUSE</b> to confirm
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy}
              placeholder="PAUSE"
              className="w-28 px-2 py-1.5 rounded border bg-transparent font-mono text-[10px] disabled:opacity-30"
              style={{ borderColor: `${RED}4D`, color: RED }} />

            <button onClick={() => run("emergency_pause")}
              disabled={busy || confirm.trim().toUpperCase() !== "PAUSE"}
              className="px-3 py-1.5 rounded border font-mono text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-25"
              style={{ background: `${RED}14`, borderColor: `${RED}59`, color: RED }}>
              Emergency Pause
            </button>

            <button onClick={() => run("resume")} disabled={busy}
              className="px-3 py-1.5 rounded border font-mono text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-25"
              style={{ borderColor: "rgba(0,255,148,0.35)", color: "#00FF94" }}>
              Resume
            </button>

            {busy && (
              <span className="flex items-center gap-1.5 font-mono text-[9px] text-white/45">
                <Loader size={9} className="animate-spin" />{STEP_LABEL[step]}
              </span>
            )}
          </div>
          {step === "error" && error && (
            <div className="mt-2 flex items-start gap-1 font-mono text-[9px] text-red-400">
              <AlertCircle size={10} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}
