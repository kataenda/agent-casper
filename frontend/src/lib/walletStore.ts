import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WalletAccount {
  publicKey:   string;
  accountHash: string;
}

interface WalletStore {
  account:          WalletAccount | null;
  agentRegistered:  boolean;
  setAccount:       (a: WalletAccount) => void;
  clearAccount:     () => void;
  setAgentRegistered: (v: boolean) => void;
}

export const useWalletStore = create<WalletStore>()(
  persist(
    (set) => ({
      account:          null,
      agentRegistered:  false,
      setAccount:       (account) => set({ account }),
      clearAccount:     () => set({ account: null }),
      setAgentRegistered: (v) => set({ agentRegistered: v }),
    }),
    { name: "casper-wallet", partialize: (s) => ({ agentRegistered: s.agentRegistered }) },
  ),
);
