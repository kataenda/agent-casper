/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        cyber: {
          void:    "#000000",
          deep:    "#02020A",
          surface: "#050510",
          border:  "rgba(0,245,255,0.12)",
          glow:    "#00F5FF",
          plasma:  "#BF5AF2",
          matrix:  "#00FF94",
          fire:    "#FF9F0A",
          red:     "#FF2D55",
          muted:   "#FFFFFF",
          dim:     "#1E2D42",
          bright:  "#E2E8F0",
        },
      },
      fontFamily: {
        mono: ["var(--font-space-mono)", "Consolas", "'Courier New'", "monospace"],
        sans: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "glow-cyan":    "0 0 20px rgba(0,245,255,0.35), 0 0 60px rgba(0,245,255,0.1)",
        "glow-purple":  "0 0 20px rgba(191,90,242,0.35), 0 0 60px rgba(191,90,242,0.1)",
        "glow-green":   "0 0 20px rgba(0,255,148,0.35), 0 0 60px rgba(0,255,148,0.1)",
        "glow-red":     "0 0 20px rgba(255,45,85,0.35), 0 0 60px rgba(255,45,85,0.1)",
        "glow-fire":    "0 0 20px rgba(255,159,10,0.35), 0 0 60px rgba(255,159,10,0.1)",
        "panel":        "0 8px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)",
      },
      animation: {
        "pulse-slow":    "pulse 3s ease-in-out infinite",
        "pulse-dot":     "pulse 1.5s ease-in-out infinite",
        "glow-breathe":  "glow-breathe 3s ease-in-out infinite",
        "spin-slow":     "spin 8s linear infinite",
        "slide-up":      "slide-up 0.4s ease-out",
        "flicker":       "flicker 8s step-start infinite",
        "scan-line":     "scan-line 6s linear infinite",
      },
      keyframes: {
        "glow-breathe": {
          "0%, 100%": { boxShadow: "0 0 8px rgba(0,245,255,0.2)" },
          "50%":       { boxShadow: "0 0 24px rgba(0,245,255,0.5), 0 0 48px rgba(0,245,255,0.15)" },
        },
        "slide-up": {
          "0%":   { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)",   opacity: "1" },
        },
        "flicker": {
          "0%, 93%, 100%": { opacity: "1" },
          "94%": { opacity: "0.8" },
          "96%": { opacity: "0.95" },
          "98%": { opacity: "0.85" },
        },
        "scan-line": {
          "0%":   { top: "0%",    opacity: "0" },
          "5%":   { opacity: "1" },
          "95%":  { opacity: "0.3" },
          "100%": { top: "100%",  opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};
