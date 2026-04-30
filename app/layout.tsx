import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Modern UI — Crafted with care",
  description:
    "A modern, accessible, and beautifully crafted experience. Built for clarity, speed, and delight.",
  metadataBase: new URL("https://example.com"),
  openGraph: {
    title: "Modern UI",
    description: "Modern, accessible, and delightful.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={`${inter.variable} ${display.variable} ${mono.variable}`}>
      <body className="font-sans antialiased min-h-dvh">
        {children}
      </body>
    </html>
  );
}
