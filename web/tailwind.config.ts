import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        bg: "#06060e",
        ink: "#0a0a16",
        "ink-2": "#10101f",
        line: "#23234a",
        "line-strong": "#34346a",
        cyan: "#00e5ff",
        magenta: "#ff2bd6",
        lime: "#39ff14",
        purple: "#9d4dff",
        gold: "#ffd23f",
        txt: "#e9f3ff",
        muted: "#8b93b8",
        faint: "#565d85",
      },
      borderRadius: { md: "6px", lg: "10px", xl: "14px" },
      keyframes: {
        flicker: {
          "0%,19%,21%,23%,80%,100%": { opacity: "1" },
          "20%,22%,82%": { opacity: "0.65" },
        },
        glow: {
          "0%,100%": { boxShadow: "0 0 0 1px rgba(0,229,255,.5), 0 0 16px rgba(0,229,255,.25)" },
          "50%": { boxShadow: "0 0 0 1px rgba(0,229,255,.9), 0 0 26px rgba(0,229,255,.5)" },
        },
        scan: { "0%": { backgroundPosition: "0 0" }, "100%": { backgroundPosition: "0 -200px" } },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(.85) translateY(4px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "spin-slow": { to: { transform: "rotate(360deg)" } },
      },
      animation: {
        flicker: "flicker 4s linear infinite",
        glow: "glow 2.4s ease-in-out infinite",
        "pop-in": "pop-in 160ms ease-out",
        "spin-slow": "spin-slow 8s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
