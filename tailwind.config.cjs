/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx,js,jsx,mdx}",
    "./pages/**/*.{ts,tsx,js,jsx,mdx}",
    "./components/**/*.{ts,tsx,js,jsx,mdx}",
  ],
  theme: {
    extend: {
      animation: {
        "float-slow": "floatSlow 20s ease-in-out infinite",
        "float-mid": "floatMid 14s ease-in-out infinite",
        "float-fast": "floatFast 10s ease-in-out infinite",
        "pulse-glow": "pulseGlow 3s ease-in-out infinite",
        "fade-up": "fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 2.4s linear infinite",
      },
      keyframes: {
        floatSlow: {
          "0%, 100%": { transform: "translate(0, 0) rotate(0deg) scale(1)" },
          "33%": { transform: "translate(30px, -50px) rotate(3deg) scale(1.05)" },
          "66%": { transform: "translate(-20px, 20px) rotate(-2deg) scale(0.98)" },
        },
        floatMid: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(-40px, 30px) scale(1.08)" },
        },
        floatFast: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(25px, -35px) scale(1.12)" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.6", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.05)" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
    },
  },
  plugins: [],
}
