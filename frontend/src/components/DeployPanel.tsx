"use client";

/**
 * DeployPanel — deploys YieldVault contract directly from connected wallet.
 * Flow:
 *   1. Fetch pre-built WASM from backend (/admin/setup/wasm)
 *   2. Build deploy using casper-js-sdk
 *   3. Casper Wallet signs it
 *   4. Submit to Casper Testnet via CSPR.cloud node
 *   5. Poll until finalized → send contract hash to backend (/admin/setup)
 */

import { useState } from "react";
import { Rocket, CheckCircle, Loader, AlertCircle } from "lucide-react";
import { useWalletStore } from "@/lib/walletStore";

const BACKEND = "http://localhost:8000";
const CHAIN   = "casper-test";
const PAYMENT = "150000000000"; // 150 CSPR

type Step = "idle" | "fetching-wasm" | "building" | "signing" | "submitting" | "waiting" | "done" | "error";

const STEP_LABEL: Record<Step, string> = {
  idle: "", "fetching-wasm": "Fetching WASM…", building: "Building deploy…",
  signing: "Waiting for wallet signature…", submitting: "Submitting to testnet…",
  waiting: "Waiting for finalization (~90s)…", done: "Contract deployed!", error: "Error",
};

export function DeployPanel() {
  const { account }                     = useWalletStore();
  const [step, setStep]                 = useState<Step>("idle");
  const [error, setError]               = useState<string | null>(null);
  const [contractHash, setContractHash] = useState<string | null>(null);

  const doDeploy = async () => {
    if (!account) return;
    setStep("fetching-wasm"); setError(null);

    try {
      // ── 1. Fetch WASM ────────────────────────────────────────────────
      const wasmRes = await fetch(`${BACKEND}/admin/setup/wasm`);
      if (!wasmRes.ok) {
        if (wasmRes.status === 404)
          throw new Error("WASM belum tersedia — push ke GitHub, tunggu Actions build selesai, lalu coba lagi.");
        throw new Error(`Fetch WASM gagal: ${wasmRes.statusText}`);
      }
      const wasmBytes = new Uint8Array(await wasmRes.arrayBuffer());

      // ── 2. Build deploy ───────────────────────────────────────────────
      setStep("building");
      const {
        Deploy, DeployHeader, ExecutableDeployItem, Args, CLValue, PublicKey, Duration, Timestamp,
      } = await import("casper-js-sdk");

      const pubKey = PublicKey.fromHex(account.publicKey);
      const header = new DeployHeader();
      header.account      = pubKey;
      header.chainName    = CHAIN;
      header.gasPrice     = 1;
      header.ttl          = new Duration(1800000);
      header.timestamp    = new Timestamp(new Date());
      header.dependencies = [];

      const payment = ExecutableDeployItem.standardPayment(PAYMENT);
      const session = ExecutableDeployItem.newModuleBytes(wasmBytes, Args.fromMap({
        "odra_cfg_package_hash_key_name": CLValue.newCLString("yield_vault"),
        "odra_cfg_allow_key_override":    CLValue.newCLValueBool(false),
        "odra_cfg_is_upgradable":         CLValue.newCLValueBool(false),
      }));
      const deploy  = Deploy.makeDeploy(header, payment, session);

      // ── 3. Sign with Casper Wallet extension ─────────────────────────
      setStep("signing");
      const provider = window.CasperWalletProvider?.();
      if (!provider) throw new Error("Casper Wallet extension tidak ditemukan");

      const deployJson    = Deploy.toJSON(deploy);
      const deployJsonStr = JSON.stringify(deployJson);
      const signResult    = await (provider as any).sign(deployJsonStr, account.publicKey);
      if (signResult?.cancelled) throw new Error("Tanda tangan dibatalkan");

      // Build signed deploy — newer wallet returns full deploy, older returns signatureHex
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let signedJson: any;
      if (signResult?.deploy) {
        signedJson = typeof signResult.deploy === "string"
          ? JSON.parse(signResult.deploy) : signResult.deploy;
      } else {
        let sigHex = (signResult?.signatureHex ?? signResult?.signature ?? "") as string;
        if (!sigHex) throw new Error("Wallet tidak mengembalikan signature");
        // Ensure 65-byte signature with algorithm prefix (01=ED25519, 02=SECP256K1)
        if (sigHex.length === 128) {
          sigHex = (account.publicKey.startsWith("02") ? "02" : "01") + sigHex;
        }
        const sigBytes = Uint8Array.from(Buffer.from(sigHex, "hex"));
        const signed   = Deploy.setSignature(deploy, sigBytes, pubKey);
        signedJson     = Deploy.toJSON(signed);
      }

      // ── 4. Submit ─────────────────────────────────────────────────────
      setStep("submitting");
      const rpcRes  = await fetch(`${BACKEND}/rpc`, {
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
        `Node error: ${rpcData.error.message}${rpcData.error.data ? ` — ${rpcData.error.data}` : ""}`
      );
      const dHash = rpcData.result.deploy_hash as string;

      // ── 5. Poll + notify backend ──────────────────────────────────────
      setStep("waiting");
      const hash = await pollForContractHash(dHash, account.publicKey);
      setContractHash(hash);

      const accountHash = pubKey.accountHash().toPrefixedString();
      await fetch(`${BACKEND}/admin/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vault_contract_hash: hash, agent_account_hash: accountHash }),
      });

      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  };

  if (step === "done" && contractHash) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-mono"
           style={{ borderColor: "rgba(0,255,148,0.3)", background: "rgba(0,255,148,0.05)", color: "#00FF94" }}>
        <CheckCircle size={11} />
        Contract live · {contractHash.slice(0, 18)}…
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {step !== "idle" && step !== "error" && (
        <span className="flex items-center gap-1.5 text-[9px] font-mono text-cyber-muted">
          <Loader size={9} className="animate-spin" />
          {STEP_LABEL[step]}
        </span>
      )}
      {step === "error" && error && (
        <span className="flex items-center gap-1 text-[9px] font-mono text-red-400 max-w-[200px] truncate" title={error}>
          <AlertCircle size={9} /> {error.slice(0, 50)}
        </span>
      )}
      <button
        onClick={doDeploy}
        disabled={!account || (step !== "idle" && step !== "error")}
        title={!account ? "Connect wallet first" : "Deploy YieldVault contract to Casper Testnet"}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-widest transition-all duration-300 disabled:opacity-30"
        style={{ background: "rgba(191,90,242,0.07)", borderColor: "rgba(191,90,242,0.35)", color: "#BF5AF2" }}
      >
        <Rocket size={10} />
        {step === "error" ? "Retry Deploy" : "Deploy Contract"}
      </button>
    </div>
  );
}

// ── Poll until deploy finalized + return contract hash ─────────────────────────

async function pollForContractHash(deployHash: string, _publicKey: string): Promise<string> {
  const base     = "http://localhost:8000";
  const deadline = Date.now() + 300_000; // 5 min

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 8000));
    try {
      const res     = await fetch(`${base}/deploys/${deployHash}`);
      const resJson = await res.json();
      // CSPR.cloud v2 wraps in { data: {...} }, flat object has status/error_message/contract_hash
      const obj = resJson.data ?? resJson;

      // Skip if still pending or no status yet
      if (!obj.status || obj.status === "pending") continue;

      // On-chain failure
      if (obj.error_message) throw new Error(`On-chain failure: ${obj.error_message}`);

      // Success — CSPR.cloud returns contract_hash directly
      if (obj.contract_hash) return obj.contract_hash as string;
      if (obj.contract_package_hash) return obj.contract_package_hash as string;

      // Processed but no contract hash (shouldn't happen for WASM deploy)
      if (obj.status === "processed") {
        throw new Error("Deploy processed tapi tidak ada contract_hash. Periksa WASM build.");
      }
    } catch (e) {
      if (e instanceof Error && (e.message.startsWith("On-chain") || e.message.startsWith("Deploy"))) throw e;
    }
  }
  throw new Error("Timeout: deploy tidak finalized dalam 5 menit");
}
