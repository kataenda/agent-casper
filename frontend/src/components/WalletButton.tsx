"use client";

import { useClickRef } from "@make-software/csprclick-ui";
import { Wallet, LogOut, Copy } from "lucide-react";
import { useWalletStore } from "@/lib/walletStore";

function truncate(addr: string) {
  return addr.length > 14 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function WalletButton() {
  const click = useClickRef();
  const { account, setAccount, clearAccount } = useWalletStore();

  // Sync CSPR.click currentAccount into Zustand
  const current = click?.currentAccount;
  if (current && current.public_key !== account?.publicKey) {
    setAccount({ publicKey: current.public_key, accountHash: "" });
  } else if (!current && account) {
    clearAccount();
  }

  const handleConnect    = () => click?.signIn();
  const handleDisconnect = () => { click?.signOut(); clearAccount(); };
  const copyAddress      = () => account && navigator.clipboard.writeText(account.publicKey);

  if (!account) {
    return (
      <button
        onClick={handleConnect}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-widest transition-all duration-300"
        style={{
          background:  "rgba(0,245,255,0.06)",
          borderColor: "rgba(0,245,255,0.35)",
          color:       "#00F5FF",
        }}
      >
        <Wallet size={11} />
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={copyAddress}
        title="Copy address"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-mono font-bold transition-all duration-300"
        style={{
          background:  "rgba(0,255,148,0.06)",
          borderColor: "rgba(0,255,148,0.3)",
          color:       "#00FF94",
          boxShadow:   "0 0 10px rgba(0,255,148,0.12)",
        }}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                style={{ backgroundColor: "#00FF94" }} />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#00FF94]" />
        </span>
        {truncate(account.publicKey)}
        <Copy size={9} className="opacity-50" />
      </button>

      <button
        onClick={handleDisconnect}
        title="Disconnect wallet"
        className="flex items-center justify-center w-7 h-7 rounded-full border transition-all duration-300"
        style={{
          background:  "rgba(255,45,85,0.05)",
          borderColor: "rgba(255,45,85,0.25)",
          color:       "#FF2D55",
        }}
      >
        <LogOut size={10} />
      </button>
    </div>
  );
}
