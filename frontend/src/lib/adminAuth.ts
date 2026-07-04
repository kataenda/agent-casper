"use client";

/**
 * Admin token storage for privileged (state-mutating) backend calls.
 *
 * The backend gates pause/resume/rebalance/swap/deploy/admin-setup behind a shared
 * secret (ADMIN_TOKEN). The owner pastes that secret into the dashboard once; we
 * keep it in localStorage and attach it as the `X-Admin-Token` header on privileged
 * requests. It is never embedded in the bundle, so anonymous visitors can't trigger
 * those actions — they get a 401.
 */
const KEY = "agentcasper_admin_token";
const SESSION_KEY = "agentcasper_admin_session";

export function getAdminToken(): string {
  if (typeof window === "undefined") return "";
  try { return window.localStorage.getItem(KEY) || ""; } catch { return ""; }
}

export function setAdminToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(KEY, token);
    else window.localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

/** Wallet-signed admin session (Bearer token from POST /auth/verify). */
export function getAdminSession(): string {
  if (typeof window === "undefined") return "";
  try { return window.localStorage.getItem(SESSION_KEY) || ""; } catch { return ""; }
}

export function setAdminSession(session: string): void {
  if (typeof window === "undefined") return;
  try {
    if (session) window.localStorage.setItem(SESSION_KEY, session);
    else window.localStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

/** Headers for a privileged request — wallet-signed session (Bearer) and/or X-Admin-Token. */
export function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  const t = getAdminToken();
  const s = getAdminSession();
  if (t) h["X-Admin-Token"] = t;
  if (s) h["Authorization"] = `Bearer ${s}`;
  return h;
}

/**
 * Sign-In with Wallet: fetch a one-time challenge, sign it with the connected
 * Casper Wallet (the vault OWNER account), and exchange the signature for a
 * 12h admin session. No shared secret involved — authorization is proven by
 * the wallet signature and checked against the on-chain owner.
 */
export async function signInWithWallet(apiBase: string): Promise<{ ok: boolean; error?: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = (window as any).CasperWalletProvider?.();
    if (!provider) return { ok: false, error: "Casper Wallet extension not found" };
    const connected = await provider.isConnected().catch(() => false);
    if (!connected) await provider.requestConnection();
    const publicKey: string = await provider.getActivePublicKey();

    const ch = await fetch(`${apiBase}/auth/challenge`).then(r => r.json());
    const res = await provider.signMessage(ch.message, publicKey);
    if (res?.cancelled) return { ok: false, error: "Signature cancelled in wallet" };
    const raw = res?.signatureHex ?? res?.signature;
    const signature = typeof raw === "string"
      ? raw
      : raw ? Array.from(raw as Uint8Array).map(b => b.toString(16).padStart(2, "0")).join("") : "";
    if (!signature) return { ok: false, error: "Wallet returned no signature" };

    const v = await fetch(`${apiBase}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_key: publicKey, nonce: ch.nonce, signature }),
    });
    const data = await v.json().catch(() => ({}));
    if (!v.ok) return { ok: false, error: data?.detail || `HTTP ${v.status}` };
    setAdminSession(data.session);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
