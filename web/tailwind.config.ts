import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        bg: "#05080a",
        panel: "#0b1013",
        "panel-2": "#0f1519",
        "panel-3": "#141b20",
        line: "#1b2329",
        "line-strong": "#2a363d",
        text: "#e8f0ee",
        "text-muted": "#8b9a96",
        "text-faint": "#566460",
        accent: "#3ee07f",
        "accent-dim": "#1c7d46",
        danger: "#ff5470",
        gold: "#ffd23f",
      },
      borderRadius: { md: "8px", lg: "12px", xl: "16px" },
      keyframes: {
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.85) translateY(4px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "float-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "20%": { opacity: "1" },
          "100%": { opacity: "0", transform: "translateY(-26px)" },
        },
      },
      animation: {
        "pop-in": "pop-in 160ms ease-out",
        "float-up": "float-up 1400ms ease-out forwards",
      },
    },
  },
  plugins: [],
};
export default config;
