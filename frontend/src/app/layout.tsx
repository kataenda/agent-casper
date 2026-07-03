import type { Metadata } from "next";
import { StarField } from "@/components/StarField";
import { CSPRClickProvider } from "@/providers/CSPRClickProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "AGENT-CASPER — Autonomous DeFi Agent",
  description: "Autonomous AI yield optimization agent on Casper Network",
  icons: {
    icon: "/agent_casper.png",
    shortcut: "/agent_casper.png",
    apple: "/agent_casper.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className="min-h-screen bg-black text-cyber-bright antialiased"
        style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}
      >
        <StarField />
        {/* CSPR.click provider — wallet connect / sign / event handling for the
            whole app (Casper AI Toolkit component). SSR-safe (client-only inside). */}
        <CSPRClickProvider>
          <div className="relative z-10">{children}</div>
        </CSPRClickProvider>
      </body>
    </html>
  );
}
