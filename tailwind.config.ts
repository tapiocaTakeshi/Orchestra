import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./pages/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx,mdx}",
    "./src/**/*.{ts,tsx,mdx}",
  ],
  darkMode: "media",
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1.25rem",
        md: "2rem",
      },
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1152px",
      },
    },
    extend: {
      colors: {
        paper: "hsl(var(--paper) / <alpha-value>)",
        mist: "hsl(var(--mist) / <alpha-value>)",
        hairline: "hsl(var(--hairline) / <alpha-value>)",
        ink: {
          DEFAULT: "hsl(var(--ink) / <alpha-value>)",
          2: "hsl(var(--ink-2) / <alpha-value>)",
          3: "hsl(var(--ink-3) / <alpha-value>)",
        },
        accent: "hsl(var(--accent) / <alpha-value>)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Hiragino Sans",
          "Noto Sans JP",
          "sans-serif",
        ],
      },
      letterSpacing: {
        tightest: "-0.03em",
        tighter: "-0.022em",
      },
      maxWidth: {
        prose: "65ch",
        readable: "72rem",
      },
      spacing: {
        section: "clamp(4rem, 3rem + 4vw, 7.5rem)",
      },
      borderRadius: {
        DEFAULT: "6px",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        rise: "rise .5s cubic-bezier(.2,.7,.2,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
