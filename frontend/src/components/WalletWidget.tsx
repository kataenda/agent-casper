"use client";

/**
 * WalletWidget — connects directly to Casper Wallet browser extension.
 * Uses window.CasperWalletProvider API (injected by the extension).
 * No CSPR.click SDK dependency — avoids styled-components/theme issues.
 */

import { useEffect, useState } from "react";
import { Wallet, LogOut, Copy, AlertCircle } from "lucide-react";
import { useWalletStore } from "@/lib/walletStore";

declare global {
  interface Window {
    CasperWalletProvider?: () => {
      requestConnection: () => Promise<boolean>;
      disconnectFromSite: () => Promise<boolean>;
      isConnected: () => Promise<boolean>;
      getActivePublicKey: () => Promise<string>;
      getVersion: () => Promise<string>;
    };
  }
}

function truncate(addr: string) {
  return addr.length > 14 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function WalletWidget() {
  const { account, setAccount, clearAccount } = useWalletStore();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Sync wallet state when extension fires events
  useEffect(() => {
    const onConnect = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.activeKey) {
        setAccount({ publicKey: detail.activeKey, accountHash: "" });
        setError(null);
      }
    };
    const onDisconnect = () => clearAccount();
    const onChanged  = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.activeKey) setAccount({ publicKey: detail.activeKey, accountHash: "" });
    };

    window.addEventListener("casperwallet:connected",   onConnect);
    window.addEventListener("casperwallet:disconnected", onDisconnect);
    window.addEventListener("casperwallet:activeKeyChanged", onChanged);
    return () => {
      window.removeEventListener("casperwallet:connected",   onConnect);
      window.removeEventListener("casperwallet:disconnected", onDisconnect);
      window.removeEventListener("casperwallet:activeKeyChanged", onChanged);
    };
  }, [setAccount, clearAccount]);

  // Re-sync on mount if already connected
  useEffect(() => {
    const sync = async () => {
      if (!window.CasperWalletProvider) return;
      const provider = window.CasperWalletProvider();
      const connected = await provider.isConnected().catch(() => false);
      if (connected) {
        const pk = await provider.getActivePublicKey().catch(() => null);
        if (pk) setAccount({ publicKey: pk, accountHash: "" });
      }
    };
    sync();
  }, [setAccount]);

  const handleConnect = async () => {
    if (!window.CasperWalletProvider) {
      // Browser extensions don't exist on mobile browsers — explain instead of
      // showing a generic "not found" that reads like a bug.
      const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
      setError(isMobile
        ? "Di HP: buka situs ini lewat browser BAWAAN app Casper Wallet (menu Browser di dalam app) — browser biasa tidak bisa melihat wallet app."
        : "Casper Wallet extension not found — install it from casperwallet.io");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const provider = window.CasperWalletProvider();
      const accepted  = await provider.requestConnection();
      if (accepted) {
        const pk = await provider.getActivePublicKey();
        setAccount({ publicKey: pk, accountHash: "" });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Connection rejected");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      if (window.CasperWalletProvider) {
        await window.CasperWalletProvider().disconnectFromSite();
      }
    } catch {
      // extension may not support disconnectFromSite — ignore
    }
    clearAccount();
  };

  if (account) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => navigator.clipboard.writeText(account.publicKey)}
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
          title="Disconnect"
          className="flex items-center justify-center w-7 h-7 rounded-full border transition-all"
          style={{ background: "rgba(255,45,85,0.05)", borderColor: "rgba(255,45,85,0.25)", color: "#FF2D55" }}
        >
          <LogOut size={10} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="flex items-center gap-1 text-[9px] font-mono text-red-400">
          <AlertCircle size={10} /> {error}
        </span>
      )}
      <button
        onClick={handleConnect}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-widest transition-all duration-300 disabled:opacity-50"
        style={{
          background:  "rgba(0,245,255,0.06)",
          borderColor: "rgba(0,245,255,0.35)",
          color:       "#00F5FF",
        }}
      >
        <Wallet size={11} />
        {loading ? "Connecting…" : "Connect Wallet"}
      </button>
    </div>
  );
}
