"use client";

/**
 * VaultControls — Register agent + deposit CSPR into YieldVault.
 * Both actions use the connected Casper Wallet to sign deploys.
 */

import { useState } from "react";
import { UserPlus, ArrowDownCircle, ArrowUpCircle, Loader, CheckCircle, AlertCircle } from "lucide-react";
import { useWalletStore } from "@/lib/walletStore";
import { useAgentStore } from "@/lib/store";
import type { VaultTx } from "@/lib/store";

const BACKEND = "http://localhost:8000";
const CHAIN   = "casper-test";
const GAS     = "10000000000"; // 10 CSPR

type Step = "idle" | "building" | "signing" | "submitting" | "done" | "error";

// ── Shared helpers ─────────────────────────────────────────────────────────────

async function buildStoredContractSession(
  contractHash: string,
  entryPoint: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  argsMap: Record<string, any>,
) {
  const sdk = await import("casper-js-sdk");
  const {
    ExecutableDeployItem, StoredVersionedContractByHash,
    ContractHash, Hash, Args,
  } = sdk as any;

  // Build args map using CLValue
  const clArgs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(argsMap)) {
    clArgs[k] = v;
  }

  // The vault contract is deployed as a ContractPackage (Casper 2.x / ODRA).
  // Use StoredVersionedContractByHash (no version = latest) with the package hash.
  const hashHex = contractHash.replace(/^(hash-|package-|contract-)/, "");
  const hashObj = Hash.fromHex(hashHex);
  const chash   = new ContractHash(hashObj, "hash-");

  const stored = new StoredVersionedContractByHash(chash, entryPoint, Args.fromMap(clArgs));
  const item   = new ExecutableDeployItem();
  item.storedVersionedContractByHash = stored;
  return { item, sdk };
}

async function signAndSubmit(
  deploy: unknown,
  publicKey: string,
  sdk: any,
): Promise<string> {
  const provider = (window as any).CasperWalletProvider?.();
  if (!provider) throw new Error("Casper Wallet tidak ditemukan");

  const { Deploy } = sdk;
  const deployJsonStr = JSON.stringify(Deploy.toJSON(deploy));
  const signResult = await provider.sign(deployJsonStr, publicKey);
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
    const signed = Deploy.setSignature(
      deploy,
      Uint8Array.from(Buffer.from(sigHex, "hex")),
      pubKey,
    );
    signedJson = Deploy.toJSON(signed);
  }

  // casper-js-sdk v5 ContractHash.toJSON() returns "hash-XXX" (69 chars) but
  // the Casper node's account_put_deploy expects raw 64-char hex without prefix.
  // Strip the prefix from both session types.
  for (const key of ["StoredContractByHash", "StoredVersionedContractByHash"]) {
    const s = signedJson?.session?.[key];
    if (s?.hash && typeof s.hash === "string") {
      s.hash = s.hash.replace(/^(hash-|package-|contract-)/, "");
    }
  }

  const rpcRes = await fetch(`${BACKEND}/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: 1, jsonrpc: "2.0",
      method: "account_put_deploy",
      params: { deploy: signedJson },
    }),
  });
  const rpcData = await rpcRes.json();
  if (rpcData.error) throw new Error(
    `Node: ${rpcData.error.message}${rpcData.error.data ? ` — ${rpcData.error.data}` : ""}`
  );
  return rpcData.result.deploy_hash as string;
}

// ── Register Agent ─────────────────────────────────────────────────────────────

export function RegisterAgentButton({ contractHash }: { contractHash: string }) {
  const { account }         = useWalletStore();
  const [step, setStep]     = useState<Step>("idle");
  const [error, setError]   = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const doRegister = async () => {
    if (!account || !contractHash) return;
    setStep("building"); setError(null);

    try {
      const agentRes  = await fetch(`${BACKEND}/admin/agent-address`);
      const agentData = await agentRes.json();
      const agentHash: string = agentData.agent_account_hash ?? "";
      if (!agentHash) throw new Error("Agent address tidak ditemukan");

      // Import SDK first, then build CLValue args
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

      const payment = ExecutableDeployItem.standardPayment(GAS);
      const deploy  = Deploy.makeDeploy(header, payment, session);

      setStep("signing");
      const hash = await signAndSubmit(deploy, account.publicKey, sdk);
      setTxHash(hash);
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  };

  if (step === "done" && txHash) return (
    <div className="flex items-center gap-1 text-[10px] font-mono" style={{ color: "#00FF94" }}>
      <CheckCircle size={10} /> Agent registered · {txHash.slice(0, 14)}…
    </div>
  );

  return (
    <div className="flex items-center gap-1.5">
      {step !== "idle" && step !== "error" && (
        <span className="flex items-center gap-1 text-[9px] font-mono text-cyber-muted">
          <Loader size={9} className="animate-spin" />{step}…
        </span>
      )}
      {step === "error" && error && (
        <span className="text-[9px] font-mono text-red-400 max-w-[160px] truncate" title={error}>
          <AlertCircle size={9} className="inline mr-1" />{error.slice(0, 40)}
        </span>
      )}
      <button onClick={doRegister}
        disabled={!account || !contractHash || (step !== "idle" && step !== "error")}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-mono font-bold uppercase tracking-widest disabled:opacity-30"
        style={{ background: "rgba(0,255,148,0.06)", borderColor: "rgba(0,255,148,0.3)", color: "#00FF94" }}>
        <UserPlus size={9} />{step === "error" ? "Retry" : "Register Agent"}
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
    if (!account || !contractHash) return;
    setStep("building"); setError(null);

    try {
      const sdk = await import("casper-js-sdk") as any;
      const { Deploy, DeployHeader, ExecutableDeployItem, PublicKey, Duration, Timestamp } = sdk;

      const amountMotes = BigInt(Math.floor(parseFloat(amount) * 1_000_000_000));
      // ODRA payable: payment = gas + deposit amount.
      // The ODRA runtime reads attached_value = payment - gas_cost.
      const totalMotes  = String(amountMotes + BigInt(GAS));

      const { item: session } = await buildStoredContractSession(
        contractHash, "deposit", {},
      );

      const pubKey = PublicKey.fromHex(account.publicKey);
      const header = new DeployHeader();
      header.account = pubKey; header.chainName = CHAIN;
      header.gasPrice = 1; header.ttl = new Duration(1800000);
      header.timestamp = new Timestamp(new Date()); header.dependencies = [];

      const payment = ExecutableDeployItem.standardPayment(totalMotes);
      const deploy  = Deploy.makeDeploy(header, payment, session);

      setStep("signing");
      const hash = await signAndSubmit(deploy, account.publicKey, sdk);
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
    <div className="flex items-center gap-1 text-[10px] font-mono" style={{ color: "#00FF94" }}>
      <CheckCircle size={10} /> Deposited {amount} CSPR · {txHash.slice(0, 14)}…
    </div>
  );

  return (
    <div className="flex items-center gap-1.5">
      {step !== "idle" && step !== "error" && (
        <span className="flex items-center gap-1 text-[9px] font-mono text-cyber-muted">
          <Loader size={9} className="animate-spin" />{step}…
        </span>
      )}
      {step === "error" && error && (
        <span className="text-[9px] font-mono text-red-400 max-w-[160px] truncate" title={error}>
          <AlertCircle size={9} className="inline mr-1" />{error.slice(0, 40)}
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
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-mono font-bold uppercase tracking-widest disabled:opacity-30"
        style={{ background: "rgba(0,212,255,0.06)", borderColor: "rgba(0,212,255,0.3)", color: "#00D4FF" }}>
        <ArrowDownCircle size={9} />{step === "error" ? "Retry" : "Deposit"}
      </button>
    </div>
  );
}

// ── Withdraw ───────────────────────────────────────────────────────────────────

export function WithdrawButton({ contractHash }: { contractHash: string }) {
  const { account }            = useWalletStore();
  const { addVaultTx }         = useAgentStore();
  const [step, setStep]        = useState<Step>("idle");
  const [error, setError]      = useState<string | null>(null);
  const [txHash, setTxHash]    = useState<string | null>(null);
  const [amount, setAmount]    = useState("50");

  const doWithdraw = async () => {
    if (!account || !contractHash) return;
    setStep("building"); setError(null);

    try {
      const sdk = await import("casper-js-sdk") as any;
      const { Deploy, DeployHeader, ExecutableDeployItem, PublicKey, Duration, Timestamp, CLValue } = sdk;

      const amountMotes = BigInt(Math.floor(parseFloat(amount) * 1_000_000_000));

      // withdraw(amount: U512) — pass amount as CLValue U512
      const clAmount = CLValue.newCLUInt512(amountMotes);
      const { item: session } = await buildStoredContractSession(
        contractHash, "withdraw", { amount: clAmount },
      );

      const pubKey = PublicKey.fromHex(account.publicKey);
      const header = new DeployHeader();
      header.account = pubKey; header.chainName = CHAIN;
      header.gasPrice = 1; header.ttl = new Duration(1800000);
      header.timestamp = new Timestamp(new Date()); header.dependencies = [];

      const payment = ExecutableDeployItem.standardPayment(GAS);
      const deploy  = Deploy.makeDeploy(header, payment, session);

      setStep("signing");
      const hash = await signAndSubmit(deploy, account.publicKey, sdk);
      setTxHash(hash);
      addVaultTx({ type: "withdraw", amount, hash, ts: Date.now() });
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  };

  if (step === "done" && txHash) return (
    <a
      href={`https://testnet.cspr.live/deploy/${txHash}`}
      target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-1 text-[10px] font-mono hover:opacity-75"
      style={{ color: "#FF9F0A" }}
    >
      <CheckCircle size={10} /> Withdrew {amount} CSPR · {txHash.slice(0, 10)}…↗
    </a>
  );

  return (
    <div className="flex items-center gap-1.5">
      {step !== "idle" && step !== "error" && (
        <span className="flex items-center gap-1 text-[9px] font-mono text-cyber-muted">
          <Loader size={9} className="animate-spin" />{step}…
        </span>
      )}
      {step === "error" && error && (
        <span className="text-[9px] font-mono text-red-400 max-w-[160px] truncate" title={error}>
          <AlertCircle size={9} className="inline mr-1" />{error.slice(0, 40)}
        </span>
      )}
      <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
        disabled={step !== "idle" && step !== "error"}
        className="w-14 px-2 py-1 rounded border bg-transparent text-[9px] font-mono text-center disabled:opacity-30"
        style={{ borderColor: "rgba(255,159,10,0.3)", color: "#FF9F0A" }}
        min="1" step="10" />
      <span className="text-[9px] font-mono text-cyber-muted">CSPR</span>
      <button onClick={doWithdraw}
        disabled={!account || !contractHash || (step !== "idle" && step !== "error")}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-mono font-bold uppercase tracking-widest disabled:opacity-30"
        style={{ background: "rgba(255,159,10,0.06)", borderColor: "rgba(255,159,10,0.3)", color: "#FF9F0A" }}>
        <ArrowUpCircle size={9} />{step === "error" ? "Retry" : "Withdraw"}
      </button>
    </div>
  );
}
