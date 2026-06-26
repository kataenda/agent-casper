"use client";

import { useAgentStore } from "@/lib/store";

// Verified autonomous mainnet swap — shown as the baseline proof so the card always
// displays a real on-chain DeFi tx, even before a fresh swap arrives this session.
const VERIFIED_PROOF = {
  tx_hash:      "2bafdb43211c32d88d815873fc2bcee12d4c141dec8cc6e24399bea5c320164f",
  amount:       "5",
  token_in:     "CSPR",
  token_out:    "sCSPR",
  explorer_url: "https://cspr.live/transaction/2bafdb43211c32d88d815873fc2bcee12d4c141dec8cc6e24399bea5c320164f",
  live:         false,
};

export function DefiProofCard() {
  const { cycles } = useAgentStore();

  // Prefer the most recent real swap executed in this live session.
  const liveSwap = cycles.find(
    (c) => c.defi_execution?.executed && c.defi_execution?.tx_hash
  )?.defi_execution;

  const proof = liveSwap?.tx_hash
    ? {
        tx_hash:      liveSwap.tx_hash!,
        amount:       liveSwap.amount ?? "",
        token_in:     liveSwap.token_in ?? "CSPR",
        token_out:    liveSwap.token_out ?? "sCSPR",
        explorer_url: liveSwap.explorer_url ?? `https://cspr.live/transaction/${liveSwap.tx_hash}`,
        live:         true,
      }
    : VERIFIED_PROOF;

  return (
    <a
      href={proof.explorer_url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg px-2.5 py-2 border hover:opacity-80 transition-opacity"
      style={{ borderColor: "rgba(191,90,242,0.35)", background: "rgba(191,90,242,0.07)" }}
      title={`Real non-custodial swap on Casper mainnet · ${proof.tx_hash}`}
    >
      <div className="flex items-center justify-between mb-0.5">
        <span
          className="text-[8px] font-mono font-bold uppercase tracking-widest flex items-center gap-1"
          style={{ color: "#BF5AF2" }}
        >
          ⚡ Real DeFi Swap · Mainnet
          {proof.live && (
            <span className="w-1 h-1 rounded-full bg-[#00FF94] animate-pulse" title="live this session" />
          )}
        </span>
        <span className="text-[8px] font-mono text-cyber-muted">cspr.live ↗</span>
      </div>
      <div className="text-[10px] font-mono text-cyber-bright">
        {proof.amount} {proof.token_in} → {proof.token_out}
        <span className="text-cyber-muted"> · non-custodial</span>
      </div>
      <div className="text-[8px] font-mono text-cyber-muted truncate">
        {proof.tx_hash.slice(0, 28)}…
      </div>
    </a>
  );
}
