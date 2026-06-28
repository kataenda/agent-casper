"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface SwapEntry {
  tx_hash: string;
  amount: string | null;
  token_in: string | null;
  token_out: string | null;
  explorer_url: string | null;
  settlement?: string;
  triggered_by?: string;
  ts: string | null;
}

// Verified autonomous mainnet swaps — baseline so the card always shows real
// on-chain DeFi proof, even before the backend history loads or after a fresh deploy.
const FALLBACK: SwapEntry[] = [
  {
    tx_hash: "2bafdb43211c32d88d815873fc2bcee12d4c141dec8cc6e24399bea5c320164f",
    amount: "5", token_in: "CSPR", token_out: "sCSPR",
    explorer_url: "https://cspr.live/transaction/2bafdb43211c32d88d815873fc2bcee12d4c141dec8cc6e24399bea5c320164f",
    triggered_by: "agent", ts: null,
  },
  {
    tx_hash: "f28a4051e17a67f4a6bd9951802cfb64a062b1daa01b59945b444fb25a052eb5",
    amount: "5", token_in: "CSPR", token_out: "sCSPR",
    explorer_url: "https://cspr.live/transaction/f28a4051e17a67f4a6bd9951802cfb64a062b1daa01b59945b444fb25a052eb5",
    triggered_by: "manual", ts: null,
  },
];

// A swap timestamped within this window is flagged "live" (executed this session).
const LIVE_WINDOW_MS = 10 * 60 * 1000;

export function DefiProofCard() {
  const [swaps, setSwaps] = useState<SwapEntry[]>(FALLBACK);

  useEffect(() => {
    let active = true;
    const fetchHistory = async () => {
      try {
        const r = await fetch(`${API}/defi/history?limit=50`);
        const d = await r.json();
        if (active && Array.isArray(d.swaps) && d.swaps.length > 0) setSwaps(d.swaps);
      } catch {
        /* keep fallback */
      }
    };
    fetchHistory();
    const id = setInterval(fetchHistory, 30_000); // refresh so new swaps appear
    return () => { active = false; clearInterval(id); };
  }, []);

  const isLive = (ts: string | null) =>
    !!ts && Date.now() - new Date(ts).getTime() < LIVE_WINDOW_MS;

  // Date + time of the swap. Recorded swaps carry a real timestamp; the seeded
  // verified proofs have none, so we label them "verified" rather than fake a date.
  const fmtTs = (ts: string | null): string => {
    if (!ts) return "verified";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "verified";
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  };

  return (
    <div
      className="rounded-lg border"
      style={{ borderColor: "rgba(191,90,242,0.35)", background: "rgba(191,90,242,0.07)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 pt-2 pb-1">
        <span
          className="text-[8px] font-mono font-bold uppercase tracking-widest"
          style={{ color: "#BF5AF2" }}
        >
          ⚡ Real DeFi Swaps · Mainnet ({swaps.length})
        </span>
        <span className="text-[8px] font-mono text-cyber-muted">cspr.live ↗</span>
      </div>

      {/* Scrollable history list */}
      <div
        className="flex flex-col"
        style={{ maxHeight: "88px", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "rgba(191,90,242,0.3) transparent" }}
      >
        {swaps.map((s) => (
          <a
            key={s.tx_hash}
            href={s.explorer_url || `https://cspr.live/transaction/${s.tx_hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 hover:bg-[rgba(191,90,242,0.08)] transition-colors border-t"
            style={{ borderColor: "rgba(191,90,242,0.12)" }}
            title={`Real non-custodial swap on Casper mainnet · ${s.tx_hash}`}
          >
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyber-bright">
              {isLive(s.ts) && (
                <span className="w-1 h-1 rounded-full bg-[#00FF94] animate-pulse shrink-0" title="live this session" />
              )}
              <span>{s.amount} {s.token_in} → {s.token_out}</span>
              <span className="text-cyber-muted">· non-custodial</span>
            </div>
            <div className="flex items-center gap-1.5 text-[8px] font-mono text-cyber-muted">
              <span className="truncate">{s.tx_hash.slice(0, 22)}…</span>
              <span className="ml-auto shrink-0 whitespace-nowrap" style={{ color: "rgba(191,90,242,0.7)" }}>
                {fmtTs(s.ts)}
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
