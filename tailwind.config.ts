import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./pages/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        muted: "var(--muted)",
        border: "var(--border)",
        accent: "var(--accent)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Minimal type scale — generous line-height
        xs: ["0.75rem", { lineHeight: "1.6" }],
        sm: ["0.875rem", { lineHeight: "1.6" }],
        base: ["1rem", { lineHeight: "1.7" }],
        lg: ["1.125rem", { lineHeight: "1.7" }],
        xl: ["1.25rem", { lineHeight: "1.6" }],
        "2xl": ["1.5rem", { lineHeight: "1.4" }],
        "3xl": ["2rem", { lineHeight: "1.25" }],
        "4xl": ["2.75rem", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
        "5xl": ["3.75rem", { lineHeight: "1.05", letterSpacing: "-0.025em" }],
        "6xl": ["5rem", { lineHeight: "1", letterSpacing: "-0.03em" }],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      maxWidth: {
        prose: "62ch",
      },
    },
  },
  plugins: [],
};

export default config;
