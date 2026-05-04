/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: "#ffffff",
          soft: "#fafafa",
        },
        ink: {
          DEFAULT: "#0a0a0a",
          soft: "#171717",
        },
        muted: {
          DEFAULT: "#737373",
          soft: "#a3a3a3",
        },
        line: {
          DEFAULT: "#e5e5e5",
          soft: "#f0f0f0",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "Helvetica Neue",
          "Hiragino Sans",
          "Noto Sans JP",
          "system-ui",
          "sans-serif",
        ],
        serif: [
          "Cormorant Garamond",
          "Times New Roman",
          "Noto Serif JP",
          "serif",
        ],
      },
      letterSpacing: {
        tightest: "-0.035em",
        tighter: "-0.03em",
        tight: "-0.02em",
        wider: "0.18em",
      },
      maxWidth: {
        container: "1120px",
        content: "720px",
      },
      spacing: {
        section: "96px",
        "section-lg": "128px",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
