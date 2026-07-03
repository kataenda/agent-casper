"use client";

import { ClickProvider } from "@make-software/csprclick-ui";
import { CONTENT_MODE } from "@make-software/csprclick-core-types";

const clickOptions = {
  appName:     "AGENT-CASPER",
  // Register your app at the CSPR.click console to get a real appId, then set
  // NEXT_PUBLIC_CSPRCLICK_APP_ID. An unregistered id returns 401 from cspr.click.
  appId:       process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID || "agent-casper-defi",
  contentMode: CONTENT_MODE.IFRAME,
  providers:   ["casper-wallet", "ledger", "torus"],
  chainName:   "casper-test",
};

export function CSPRClickInner({ children }: { children: React.ReactNode }) {
  return (
    <ClickProvider options={clickOptions}>
      {children}
    </ClickProvider>
  );
}
