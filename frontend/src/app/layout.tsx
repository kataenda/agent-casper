import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";
import { StarField } from "@/components/StarField";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-space-mono",
  weight: ["400", "700"],
  display: "swap",
});

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
    <html lang="en" className={`${spaceGrotesk.variable} ${spaceMono.variable}`}>
      <body
        className="min-h-screen bg-black text-cyber-bright antialiased"
        style={{ fontFamily: "var(--font-space-grotesk), system-ui, sans-serif" }}
      >
        <StarField />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
