import type { Config } from "tailwindcss";

// Loopdesk AI design system (same tokens in all 7 tools).
// Logo crimson in every portal and tool. Rules: the "Loopdesk AI" design system.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand scale from CSS variables (app/globals.css).
        // 600 = primary button, 700 = top bar, 800 = hover, 100 + 900 = soft badge.
        brand: {
          DEFAULT: "rgb(var(--brand-600) / <alpha-value>)",
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
        },
        // Border for inputs and secondary buttons (3:1 on white).
        control: "#878e99",
        ink: { DEFAULT: "#111827", muted: "#4b5563", subtle: "#6b7280" },
      },
      fontFamily: {
        sans: ["var(--font-plex)", "var(--font-devanagari)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        input: "10px",
        card: "14px",
        modal: "20px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(17,24,39,0.06)",
        pop: "0 8px 24px rgba(17,24,39,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
