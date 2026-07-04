"use client";

/**
 * Wallet-scoped vault resolution — the multi-wallet backbone.
 *
 * Every wallet that deploys through /deploy owns its own YieldVault package,
 * recorded under the account named key `yield_vault_prod`. Resolving that key
 * for the CONNECTED wallet lets Register/Deposit/Upgrade target the caller's
 * own vault (like any multi-wallet dApp), falling back to the globally
 * configured vault only when the wallet has none.
 */

import { useState, useEffect } from "react";
import { useWalletStore } from "@/lib/walletStore";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const VAULT_KEY_NAME = "yield_vault_prod";

/** The package hash stored under `keyName` in the account's named keys (64-hex,
 *  no prefix), or null if absent. */
export async function getNamedKeyPackageHash(
  callerHash: string,
  keyName: string = VAULT_KEY_NAME,
): Promise<string | null> {
  try {
    const res = await fetch(`${BACKEND}/rpc`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1, jsonrpc: "2.0", method: "query_global_state",
        params: { key: `account-hash-${callerHash}`, path: [] },
      }),
    });
    const data = await res.json();
    const sv = data.result?.stored_value;
    const namedKeys: Array<{ name: string; key: string }> =
      sv?.Account?.named_keys ?? sv?.AddressableEntity?.named_keys ?? sv?.Entity?.named_keys ?? [];
    const entry = namedKeys.find((k) => k.name === keyName);
    if (!entry?.key) return null;
    const hex = entry.key.replace(/^(hash-|package-|contract-package-|entity-contract-)/, "");
    return /^[0-9a-fA-F]{64}$/.test(hex) ? hex.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Resolve the connected wallet's own vault package (64-hex) from its public key. */
export async function resolveWalletVault(publicKeyHex: string): Promise<string | null> {
  try {
    const { PublicKey } = await import("casper-js-sdk");
    const callerHash = PublicKey.fromHex(publicKeyHex)
      .accountHash().toPrefixedString().replace("account-hash-", "");
    return await getNamedKeyPackageHash(callerHash);
  } catch {
    return null;
  }
}

/**
 * React hook: the connected wallet's vault, `hash-` prefixed.
 * vaultHash = null → wallet has no vault (or no wallet); checked = resolution done.
 */
export function useWalletVault(): { vaultHash: string | null; checked: boolean } {
  const { account } = useWalletStore();
  const [state, setState] = useState<{ vaultHash: string | null; checked: boolean }>(
    { vaultHash: null, checked: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!account?.publicKey) {
        setState({ vaultHash: null, checked: true });
        return;
      }
      setState(s => ({ ...s, checked: false }));
      const pkg = await resolveWalletVault(account.publicKey);
      if (!cancelled) setState({ vaultHash: pkg ? `hash-${pkg}` : null, checked: true });
    })();
    return () => { cancelled = true; };
  }, [account?.publicKey]);

  return state;
}
