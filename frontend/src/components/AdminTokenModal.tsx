"use client";

import { useState, useEffect } from "react";
import { ShieldAlert, X, KeyRound, Unlock } from "lucide-react";
import { getAdminToken, setAdminToken } from "@/lib/adminAuth";

const CLIP = "polygon(14px 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%,0 14px)";

/**
 * Professional in-app gate for privileged actions. Shown when a mutating call
 * returns 401. Lets the owner paste the admin token (stored locally) and retry —
 * replaces the browser `alert()`.
 */
export function AdminTokenModal({
  open, onClose, onUnlock, accent = "#00F5FF",
  title = "Admin access required",
  message = "This action is protected. Paste the admin token to continue.",
}: {
  open: boolean;
  onClose: () => void;
  onUnlock: () => void;            // called after the token is saved
  accent?: string;
  title?: string;
  message?: string;
}) {
  const [token, setToken] = useState("");
  useEffect(() => { if (open) setToken(getAdminToken()); }, [open]);

  if (!open) return null;

  const unlock = () => {
    if (!token.trim()) return;
    setAdminToken(token.trim());
    onUnlock();
  };

  return (
    <div onClick={onClose}
         className="fixed inset-0 z-[200] flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,3,0.82)", backdropFilter: "blur(6px)" }}>
      <div onClick={e => e.stopPropagation()} className="relative w-full max-w-[420px] p-[1.5px]"
           style={{ clipPath: CLIP, background: accent, filter: `drop-shadow(0 0 24px ${accent}88)` }}>
        <div className="relative p-5" style={{ clipPath: CLIP, background: "rgba(2,3,7,0.99)" }}>
          <div style={{ position: "absolute", top: 0, left: "8%", right: "8%", height: 2,
            background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, boxShadow: `0 0 12px 2px ${accent}88` }} />

          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} style={{ color: accent }} />
              <h2 className="font-mono font-bold uppercase tracking-[0.15em] text-sm" style={{ color: accent }}>
                {title}
              </h2>
            </div>
            <button onClick={onClose} className="text-cyber-muted hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          <p className="text-[11px] font-mono text-cyber-muted leading-relaxed mb-3">{message}</p>

          {/* Token input */}
          <div className="flex items-center gap-2 px-2 py-1.5 rounded mb-1"
               style={{ background: `${accent}06`, border: `1px solid ${accent}33` }}>
            <KeyRound size={13} style={{ color: accent }} />
            <input
              type="password"
              autoFocus
              value={token}
              onChange={e => setToken(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") unlock(); }}
              placeholder="paste admin token"
              className="flex-1 bg-transparent font-mono text-[11px] outline-none"
              style={{ color: "#fff" }}
            />
          </div>
          <p className="text-[8px] font-mono text-cyber-muted/70 mb-4">
            Stored in this browser only · sent as X-Admin-Token. Set the matching ADMIN_TOKEN on the backend.
          </p>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={onClose}
                    className="flex-1 rounded-lg py-2 font-mono text-[10px] uppercase tracking-widest transition-all hover:opacity-85"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}>
              Cancel
            </button>
            <button onClick={unlock} disabled={!token.trim()}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 font-mono text-[10px] font-bold uppercase tracking-widest transition-all hover:opacity-85 disabled:opacity-40"
                    style={{ background: accent, color: "#000", boxShadow: `0 0 18px ${accent}55` }}>
              <Unlock size={11} /> Unlock & Retry
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
