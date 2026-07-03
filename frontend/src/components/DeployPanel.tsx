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

import { useState, useEffect } from "react";
import { Rocket, CheckCircle, Loader, AlertCircle, ExternalLink } from "lucide-react";
import { useWalletStore } from "@/lib/walletStore";
import { adminHeaders } from "@/lib/adminAuth";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const CHAIN   = "casper-test";
const PAYMENT = "500000000000"; // 500 CSPR

type Step = "idle" | "fetching-wasm" | "building" | "signing" | "submitting" | "waiting" | "done" | "error";

const STEP_LABEL: Record<Step, string> = {
  idle: "", "fetching-wasm": "Fetching WASM…", building: "Building deploy…",
  signing: "Waiting for wallet signature…", submitting: "Submitting to testnet…",
  waiting: "Waiting for finalization (~90s)…", done: "Contract deployed!", error: "Error",
};

export function DeployPanel() {
  const { account }                         = useWalletStore();
  const [step, setStep]                     = useState<Step>("idle");
  const [error, setError]                   = useState<string | null>(null);
  const [contractHash, setContractHash]     = useState<string | null>(null);
  const [existingHash, setExistingHash]     = useState<string | null>(null);

  useEffect(() => {
    // Try static contract.json first (no backend dependency)
    fetch("/contract.json")
      .then(r => r.json())
      .then(d => { if (d.deployed && d.vault_contract_hash) setExistingHash(d.vault_contract_hash); })
      .catch(() => {});
    // Also try backend endpoint (updated backend)
    fetch(`${BACKEND}/admin/contract-info`)
      .then(r => r.json())
      .then(d => { if (d.contract_deployed && d.vault_contract_hash) setExistingHash(d.vault_contract_hash); })
      .catch(() => {});
  }, []);

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

      // Stable key for the production, UPGRADABLE vault. The first deploy INSTALLS
      // it; every later deploy UPGRADES in place under the same package hash — so the
      // env hash never changes again and depositor state is preserved (the contract's
      // init() is idempotent). We pick install-vs-upgrade by whether the deployer
      // account already holds this named key.
      const pkgKey = "yield_vault_prod";
      const callerHash = pubKey.accountHash().toPrefixedString().replace("account-hash-", "");
      const isUpgrade = await accountHasNamedKey(callerHash, pkgKey);

      const payment = ExecutableDeployItem.standardPayment(PAYMENT);
      const session = ExecutableDeployItem.newModuleBytes(wasmBytes, Args.fromMap({
        "odra_cfg_package_hash_key_name": CLValue.newCLString(pkgKey),
        "odra_cfg_allow_key_override":    CLValue.newCLValueBool(false),
        "odra_cfg_is_upgradable":         CLValue.newCLValueBool(true),
        "odra_cfg_is_upgrade":            CLValue.newCLValueBool(isUpgrade),
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
      const deployBody = JSON.stringify({
        id: 1, jsonrpc: "2.0",
        method: "account_put_deploy",
        params: { deploy: signedJson },
      });

      const rpcRes = await fetch(`${BACKEND}/rpc`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: deployBody,
      });
      const rpcData = await rpcRes.json();
      if (!rpcRes.ok) throw new Error(`HTTP ${rpcRes.status}: ${rpcData.detail ?? JSON.stringify(rpcData).slice(0, 200)}`);
      if (rpcData.error) throw new Error(`Node: ${rpcData.error.message}`);
      if (!rpcData.result?.deploy_hash) throw new Error(`RPC: ${JSON.stringify(rpcData).slice(0, 200)}`);
      const dHash = rpcData.result.deploy_hash;

      // ── 5. Poll + notify backend ──────────────────────────────────────
      setStep("waiting");
      // callerHash computed above (used for install-vs-upgrade detection too)
      const hash = await pollForContractHash(dHash, callerHash, pkgKey);
      setContractHash(hash);

      // Use agent address from backend (PEM key), not deployer address
      const agentRes  = await fetch(`${BACKEND}/admin/agent-address`);
      const agentData = await agentRes.json();
      const agentHash = agentData.agent_account_hash ?? pubKey.accountHash().toPrefixedString();
      await fetch(`${BACKEND}/admin/setup`, {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ vault_contract_hash: hash, agent_account_hash: agentHash }),
      });

      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  };

  const displayHash = contractHash ?? existingHash;
  const EXPLORER    = "https://testnet.cspr.live/contract-package";
  const inProgress  = step !== "idle" && step !== "error" && step !== "done";
  const btnLabel    = step === "error" ? "Retry Deploy"
                    : contractHash      ? "Deployed ✓"
                    : displayHash       ? "Deploy New (payable)"
                    : "Deploy Contract";

  return (
    <div className="flex flex-col gap-1.5">
      {displayHash && (
        <>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border"
               style={{ borderColor: "rgba(0,255,148,0.35)", background: "rgba(0,255,148,0.06)" }}>
            <CheckCircle size={11} style={{ color: "#00FF94", flexShrink: 0 }} />
            <span className="text-[10px] font-mono font-bold" style={{ color: "#00FF94" }}>
              CONTRACT LIVE
            </span>
            <span className="text-[9px] font-mono text-cyber-muted ml-1">
              {contractHash ? "✓ just deployed" : "(existing)"}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border"
               style={{ borderColor: "rgba(0,245,255,0.2)", background: "rgba(0,245,255,0.04)" }}>
            <span className="text-[9px] font-mono text-cyber-muted shrink-0">HASH</span>
            <span className="text-[9px] font-mono truncate max-w-[160px]"
                  style={{ color: "#00F5FF" }} title={displayHash}>
              {displayHash.replace("hash-", "").slice(0, 20)}…
            </span>
            <a href={`${EXPLORER}/${displayHash.replace("hash-", "")}`}
               target="_blank" rel="noopener noreferrer"
               className="ml-auto hover:opacity-75 transition-opacity shrink-0"
               title="View on testnet.cspr.live">
              <ExternalLink size={10} style={{ color: "#00F5FF" }} />
            </a>
          </div>
        </>
      )}

      <div className="flex items-center gap-2 mt-0.5">
        {inProgress && (
          <span className="flex items-center gap-1.5 text-[9px] font-mono text-cyber-muted">
            <Loader size={9} className="animate-spin" />
            {STEP_LABEL[step]}
          </span>
        )}
        {step === "error" && error && (
          <span className="flex items-center gap-1 text-[9px] font-mono text-red-400 max-w-[220px] truncate" title={error}>
            <AlertCircle size={9} /> {error.slice(0, 60)}
          </span>
        )}
        <button
          onClick={doDeploy}
          disabled={!account || inProgress || step === "done"}
          title={!account ? "Connect wallet first"
                : displayHash ? "Deploy the new payable YieldVault as a fresh package"
                : "Deploy YieldVault contract to Casper Testnet"}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-widest transition-all duration-300 disabled:opacity-30"
          style={{ background: "rgba(191,90,242,0.07)", borderColor: "rgba(191,90,242,0.35)", color: "#BF5AF2" }}
        >
          <Rocket size={10} />
          {btnLabel}
        </button>
      </div>
    </div>
  );
}

// ── Poll until deploy finalized + return contract hash ─────────────────────────

// Whether the deployer account already holds `keyName` (⇒ this is an upgrade, not a fresh install).
async function accountHasNamedKey(callerHash: string, keyName: string): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  try {
    const res = await fetch(`${base}/rpc`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1, jsonrpc: "2.0", method: "query_global_state",
        params: { key: `account-hash-${callerHash}`, path: [] },
      }),
    });
    const data = await res.json();
    const sv = data.result?.stored_value;
    const namedKeys: Array<{ name: string }> =
      sv?.Account?.named_keys ?? sv?.AddressableEntity?.named_keys ?? sv?.Entity?.named_keys ?? [];
    return namedKeys.some((k) => k.name === keyName);
  } catch {
    return false; // treat unknown as fresh install
  }
}

async function pollForContractHash(deployHash: string, callerHash: string, pkgKey = "yield_vault"): Promise<string> {
  const base     = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
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

      // On-chain failure — but CannotOverrideKeys (64641) means contract already exists:
      // fall through to named-key lookup instead of throwing
      const isAlreadyInstalled = obj.error_message === "User error: 64641";
      if (obj.error_message && !isAlreadyInstalled)
        throw new Error(`On-chain failure: ${obj.error_message}`);

      // Casper 1.x — CSPR.cloud returns contract_hash directly in deploy result
      if (obj.contract_hash) return obj.contract_hash as string;
      if (obj.contract_package_hash) return obj.contract_package_hash as string;

      // Casper 2.x — contract stored as package under named key "yield_vault" in account.
      // Also handles CannotOverrideKeys: contract already deployed, just read its hash.
      // Use query_global_state RPC to look up the named key directly.
      if ((obj.status === "processed") && callerHash) {
        const rpcRes = await fetch(`${base}/rpc`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: 1, jsonrpc: "2.0",
            method: "query_global_state",
            params: { key: `account-hash-${callerHash}`, path: [pkgKey] },
          }),
        });
        const rpcData = await rpcRes.json();
        if (rpcData.error) throw new Error(`RPC error: ${rpcData.error.message ?? JSON.stringify(rpcData.error)}`);

        // path:["yield_vault"] returns the package CONTENT, not the hash.
        // We need the account object (path:[]) which has named_keys listing the key.
        const rpcAcc = await fetch(`${base}/rpc`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: 2, jsonrpc: "2.0",
            method: "query_global_state",
            params: { key: `account-hash-${callerHash}`, path: [] },
          }),
        });
        const accData = await rpcAcc.json();
        if (accData.error) throw new Error(`RPC error (account): ${accData.error.message ?? JSON.stringify(accData.error)}`);
        const sv = accData.result?.stored_value;
        // Named keys are in Account.named_keys (Casper 1.x) or AddressableEntity.named_keys (Casper 2.x)
        const namedKeys: Array<{name: string; key: string}> =
          sv?.Account?.named_keys ??
          sv?.AddressableEntity?.named_keys ??
          sv?.Entity?.named_keys ?? [];
        const vaultEntry = namedKeys.find((k: {name: string}) => k.name === pkgKey);
        if (vaultEntry?.key) return vaultEntry.key as string;
        throw new Error(`Named key '${pkgKey}' tidak ditemukan. Keys: ${namedKeys.map((k: {name: string}) => k.name).join(", ")}`);
      }
    } catch (e) {
      if (e instanceof Error && (e.message.startsWith("On-chain") || e.message.startsWith("Deploy") || e.message.startsWith("Deploy berhasil"))) throw e;
    }
  }
  throw new Error("Timeout: deploy tidak finalized dalam 5 menit");
}
