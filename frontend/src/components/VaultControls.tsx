"use client";

/**
 * VaultControls — Register agent + deposit CSPR into YieldVault.
 * Both actions use the connected Casper Wallet to sign deploys.
 *
 * register_agent(agent: Address) — owner registers the AI agent so it can rebalance
 * deposit()                      — payable, transfers CSPR to vault
 */

import { useState } from "react";
import { UserPlus, ArrowDownCircle, Loader, CheckCircle, AlertCircle } from "lucide-react";
import { useWalletStore } from "@/lib/walletStore";

const BACKEND  = "http://localhost:8000";
const CHAIN    = "casper-test";
const PAYMENT  = "10000000000"; // 10 CSPR gas budget

type ActionStep = "idle" | "building" | "signing" | "submitting" | "done" | "error";

// ── Register Agent ────────────────────────────────────────────────────────────

export function RegisterAgentButton({ contractHash }: { contractHash: string }) {
  const { account }          = useWalletStore();
  const [step, setStep]      = useState<ActionStep>("idle");
  const [error, setError]    = useState<string | null>(null);
  const [txHash, setTxHash]  = useState<string | null>(null);

  const doRegister = async () => {
    if (!account || !contractHash) return;
    setStep("building"); setError(null);

    try {
      // Get agent address from backend
      const agentRes  = await fetch(`${BACKEND}/admin/agent-address`);
      const agentData = await agentRes.json();
      const agentAccountHash: string = agentData.agent_account_hash ?? "";
      if (!agentAccountHash) throw new Error("Agent address tidak ditemukan di backend");

      const { Deploy, DeployHeader, ExecutableDeployItem, Args, CLValue,
              PublicKey, Duration, Timestamp, CLValueBuilder } = await import("casper-js-sdk");

      const pubKey = PublicKey.fromHex(account.publicKey);
      const header = new DeployHeader();
      header.account      = pubKey;
      header.chainName    = CHAIN;
      header.gasPrice     = 1;
      header.ttl          = new Duration(1800000);
      header.timestamp    = new Timestamp(new Date());
      header.dependencies = [];

      // register_agent(agent: Address) — pass as Key (account-hash-...)
      const payment = ExecutableDeployItem.standardPayment(PAYMENT);
      const session = ExecutableDeployItem.storedContractByHash !== undefined
        ? (ExecutableDeployItem as any).storedContractByHash(
            contractHash.replace("hash-", ""),
            "register_agent",
            Args.fromMap({ "agent": CLValue.newCLKey(agentAccountHash) })
          )
        : null;

      if (!session) throw new Error("storedContractByHash tidak tersedia di casper-js-sdk v5");

      const deploy = Deploy.makeDeploy(header, payment, session);

      setStep("signing");
      const provider = window.CasperWalletProvider?.();
      if (!provider) throw new Error("Casper Wallet tidak ditemukan");

      const signResult = await (provider as any).sign(
        JSON.stringify(Deploy.toJSON(deploy)),
        account.publicKey,
      );
      if (signResult?.cancelled) throw new Error("Dibatalkan");

      let signedJson: any;
      if (signResult?.deploy) {
        signedJson = typeof signResult.deploy === "string"
          ? JSON.parse(signResult.deploy) : signResult.deploy;
      } else {
        let sigHex = (signResult?.signatureHex ?? signResult?.signature ?? "") as string;
        if (sigHex.length === 128) sigHex = (account.publicKey.startsWith("02") ? "02" : "01") + sigHex;
        const signed = Deploy.setSignature(deploy, Uint8Array.from(Buffer.from(sigHex, "hex")), pubKey);
        signedJson = Deploy.toJSON(signed);
      }

      setStep("submitting");
      const rpcRes = await fetch(`${BACKEND}/rpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "account_put_deploy", params: { deploy: signedJson } }),
      });
      const rpcData = await rpcRes.json();
      if (rpcData.error) throw new Error(`Node error: ${rpcData.error.message}`);

      setTxHash(rpcData.result.deploy_hash);
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  };

  if (step === "done" && txHash) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: "#00FF94" }}>
        <CheckCircle size={10} /> Agent registered · {txHash.slice(0, 16)}…
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {step !== "idle" && step !== "error" && (
        <span className="flex items-center gap-1 text-[9px] font-mono text-cyber-muted">
          <Loader size={9} className="animate-spin" /> {step}…
        </span>
      )}
      {step === "error" && error && (
        <span className="text-[9px] font-mono text-red-400 max-w-[160px] truncate" title={error}>
          <AlertCircle size={9} className="inline mr-1" />{error.slice(0, 40)}
        </span>
      )}
      <button
        onClick={doRegister}
        disabled={!account || !contractHash || (step !== "idle" && step !== "error")}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-mono font-bold uppercase tracking-widest transition-all disabled:opacity-30"
        style={{ background: "rgba(0,255,148,0.06)", borderColor: "rgba(0,255,148,0.3)", color: "#00FF94" }}
      >
        <UserPlus size={9} />
        {step === "error" ? "Retry" : "Register Agent"}
      </button>
    </div>
  );
}

// ── Deposit ───────────────────────────────────────────────────────────────────

export function DepositButton({ contractHash }: { contractHash: string }) {
  const { account }          = useWalletStore();
  const [step, setStep]      = useState<ActionStep>("idle");
  const [error, setError]    = useState<string | null>(null);
  const [txHash, setTxHash]  = useState<string | null>(null);
  const [amount, setAmount]  = useState("100"); // CSPR

  const doDeposit = async () => {
    if (!account || !contractHash) return;
    const amountMotes = String(Math.floor(parseFloat(amount) * 1_000_000_000));
    setStep("building"); setError(null);

    try {
      const { Deploy, DeployHeader, ExecutableDeployItem, Args, PublicKey, Duration, Timestamp } =
        await import("casper-js-sdk");

      const pubKey = PublicKey.fromHex(account.publicKey);
      const header = new DeployHeader();
      header.account      = pubKey;
      header.chainName    = CHAIN;
      header.gasPrice     = 1;
      header.ttl          = new Duration(1800000);
      header.timestamp    = new Timestamp(new Date());
      header.dependencies = [];

      // deposit() is payable — payment amount = gas + attached value
      const totalMotes = String(BigInt(amountMotes) + BigInt(PAYMENT));
      const payment = ExecutableDeployItem.standardPayment(totalMotes);
      const session = (ExecutableDeployItem as any).storedContractByHash(
        contractHash.replace("hash-", ""),
        "deposit",
        Args.fromMap({}),
      );

      const deploy = Deploy.makeDeploy(header, payment, session);

      setStep("signing");
      const provider = window.CasperWalletProvider?.();
      if (!provider) throw new Error("Casper Wallet tidak ditemukan");

      const signResult = await (provider as any).sign(
        JSON.stringify(Deploy.toJSON(deploy)),
        account.publicKey,
      );
      if (signResult?.cancelled) throw new Error("Dibatalkan");

      let signedJson: any;
      if (signResult?.deploy) {
        signedJson = typeof signResult.deploy === "string"
          ? JSON.parse(signResult.deploy) : signResult.deploy;
      } else {
        let sigHex = (signResult?.signatureHex ?? signResult?.signature ?? "") as string;
        if (sigHex.length === 128) sigHex = (account.publicKey.startsWith("02") ? "02" : "01") + sigHex;
        const signed = Deploy.setSignature(deploy, Uint8Array.from(Buffer.from(sigHex, "hex")), pubKey);
        signedJson = Deploy.toJSON(signed);
      }

      setStep("submitting");
      const rpcRes = await fetch(`${BACKEND}/rpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "account_put_deploy", params: { deploy: signedJson } }),
      });
      const rpcData = await rpcRes.json();
      if (rpcData.error) throw new Error(`Node error: ${rpcData.error.message}`);

      setTxHash(rpcData.result.deploy_hash);
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  };

  if (step === "done" && txHash) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: "#00FF94" }}>
        <CheckCircle size={10} /> Deposited {amount} CSPR · {txHash.slice(0, 16)}…
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {step !== "idle" && step !== "error" && (
        <span className="flex items-center gap-1 text-[9px] font-mono text-cyber-muted">
          <Loader size={9} className="animate-spin" /> {step}…
        </span>
      )}
      {step === "error" && error && (
        <span className="text-[9px] font-mono text-red-400 max-w-[160px] truncate" title={error}>
          <AlertCircle size={9} className="inline mr-1" />{error.slice(0, 40)}
        </span>
      )}
      <input
        type="number"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        disabled={step !== "idle" && step !== "error"}
        className="w-16 px-2 py-1 rounded border bg-transparent text-[9px] font-mono text-center disabled:opacity-30"
        style={{ borderColor: "rgba(0,212,255,0.3)", color: "#00D4FF" }}
        min="1" step="10"
      />
      <span className="text-[9px] font-mono text-cyber-muted">CSPR</span>
      <button
        onClick={doDeposit}
        disabled={!account || !contractHash || (step !== "idle" && step !== "error")}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-mono font-bold uppercase tracking-widest transition-all disabled:opacity-30"
        style={{ background: "rgba(0,212,255,0.06)", borderColor: "rgba(0,212,255,0.3)", color: "#00D4FF" }}
      >
        <ArrowDownCircle size={9} />
        {step === "error" ? "Retry" : "Deposit"}
      </button>
    </div>
  );
}
