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

/** Headers for a privileged request — includes X-Admin-Token when one is stored. */
export function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const t = getAdminToken();
  return t ? { ...extra, "X-Admin-Token": t } : { ...extra };
}
