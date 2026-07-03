"use client";

import dynamic from "next/dynamic";

// CSPR.click uses styled-components — must be client-only (no SSR)
const ClickProviderNoSSR = dynamic(
  () => import("./CSPRClickInner").then((m) => ({ default: m.CSPRClickInner })),
  { ssr: false }
);

// Only mount CSPR.click when a registered appId is configured. An unregistered
// appId returns 401 from accounts.cspr.click and crashes the SDK (undefined.map),
// taking the whole dashboard down. Without it we fall through to the direct
// Casper Wallet flow (WalletWidget) and the app stays fully functional.
const APP_ID = process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID;

export function CSPRClickProvider({ children }: { children: React.ReactNode }) {
  if (!APP_ID) return <>{children}</>;
  return <ClickProviderNoSSR>{children}</ClickProviderNoSSR>;
}
