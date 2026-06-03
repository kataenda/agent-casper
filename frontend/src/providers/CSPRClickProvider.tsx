"use client";

import dynamic from "next/dynamic";

// CSPR.click uses styled-components — must be client-only (no SSR)
const ClickProviderNoSSR = dynamic(
  () => import("./CSPRClickInner").then((m) => ({ default: m.CSPRClickInner })),
  { ssr: false }
);

export function CSPRClickProvider({ children }: { children: React.ReactNode }) {
  return <ClickProviderNoSSR>{children}</ClickProviderNoSSR>;
}
