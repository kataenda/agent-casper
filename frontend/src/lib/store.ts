import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface YieldRate {
  strategy: string;
  apy_bps: number;
  tvl_cspr: number;
  risk_score: number;
}

export interface Portfolio {
  total_value_motes: number;
  conservative_pct: number;
  balanced_pct: number;
  aggressive_pct: number;
  current_strategy: string;
  last_rebalance_timestamp: number;
}

export interface Decision {
  action: "HOLD" | "REBALANCE" | "ALERT";
  new_strategy: string | null;
  conservative_pct: number;
  balanced_pct: number;
  aggressive_pct: number;
  reasoning: string;
  confidence: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
}

export interface RWAPrice {
  asset_id:   string;
  name:       string;
  category:   string;
  price_usd:  number | null;
  yield_pct:  number | null;
  unit:       string;
  change_pct: number | null;
  source:     string;
  on_chain:   boolean;
  note:       string;
}

export interface AgentCycle {
  timestamp: string;
  block_height: number;
  yield_rates: YieldRate[];
  portfolio: Portfolio;
  decision: Decision;
  rwa_prices?: RWAPrice[];
  rwa_tx_hashes?: Record<string, string>;
  tx_hash: string | null;
}

export interface AgentStats {
  running: boolean;
  rebalances_today: number;
  total_cycles: number;
  poll_interval_seconds: number;
}

export interface VaultTx {
  type: "deposit" | "withdraw";
  amount: string;
  hash: string;
  ts: number;
}

interface AgentStore {
  connected: boolean;
  stats: AgentStats | null;
  latestCycle: AgentCycle | null;
  cycles: AgentCycle[];
  portfolioHistory: { time: string; value: number }[];
  depositedMotes: number;
  vaultTxs: VaultTx[];

  setConnected: (v: boolean) => void;
  setStats: (s: AgentStats) => void;
  addCycle: (c: AgentCycle) => void;
  addDeposit: (motes: number) => void;
  addVaultTx: (tx: VaultTx) => void;
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      connected: false,
      stats: null,
      latestCycle: null,
      cycles: [],
      portfolioHistory: [],
      depositedMotes: 0,
      vaultTxs: [],

      setConnected: (v) => set({ connected: v }),
      setStats: (s) => set({ stats: s }),

      addVaultTx: (tx) =>
        set((s) => ({ vaultTxs: [tx, ...s.vaultTxs].slice(0, 10) })),

      addDeposit: (motes) => {
        const { depositedMotes, latestCycle, portfolioHistory } = get();
        const newDeposited = depositedMotes + motes;
        set({ depositedMotes: newDeposited });
        if (latestCycle) {
          const newValue = (latestCycle.portfolio.total_value_motes + newDeposited) / 1e9;
          set({
            portfolioHistory: [
              ...portfolioHistory,
              { time: new Date().toLocaleTimeString(), value: newValue },
            ].slice(-30),
          });
        }
      },

      addCycle: (c) => {
        const { cycles, portfolioHistory, depositedMotes } = get();
        const newCycles = [c, ...cycles].slice(0, 50);
        const displayValue = (c.portfolio.total_value_motes + depositedMotes) / 1e9;
        const newHistory = [
          ...portfolioHistory,
          { time: new Date(c.timestamp).toLocaleTimeString(), value: displayValue },
        ].slice(-30);
        set({
          latestCycle: c,
          cycles: newCycles,
          portfolioHistory: newHistory,
        });
      },
    }),
    {
      name: "agent-casper-vault",
      partialize: (s) => ({ vaultTxs: s.vaultTxs }),
    }
  )
);
