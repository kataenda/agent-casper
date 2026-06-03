import { create } from "zustand";

interface WalletAccount {
  publicKey:   string;
  accountHash: string;
}

interface WalletStore {
  account: WalletAccount | null;
  setAccount: (a: WalletAccount) => void;
  clearAccount: () => void;
}

export const useWalletStore = create<WalletStore>((set) => ({
  account: null,
  setAccount:  (account) => set({ account }),
  clearAccount: () => set({ account: null }),
}));
