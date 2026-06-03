"use client";

import { ClickProvider } from "@make-software/csprclick-ui";
import { CONTENT_MODE } from "@make-software/csprclick-core-types";

const clickOptions = {
  appName:     "AGENT-CASPER",
  appId:       "agent-casper-defi",
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
