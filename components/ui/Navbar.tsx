"use client";
import Link from "next/link";
import * as React from "react";
import { Container } from "./Container";
import { Button } from "./Button";
import { cn } from "@/lib/cn";

export function Navbar({
  brand = "Acme",
  links = [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "Docs", href: "#docs" },
  ],
}: {
  brand?: string;
  links?: { label: string; href: string }[];
}) {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        scrolled ? "py-2" : "py-4"
      )}
    >
      <Container>
        <nav
          className={cn(
            "glass flex items-center justify-between rounded-2xl px-4 md:px-5 py-2.5",
            "shadow-[var(--shadow-sm)]"
          )}
          aria-label="Primary"
        >
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <span
              aria-hidden
              className="inline-block h-7 w-7 rounded-xl bg-[linear-gradient(135deg,rgb(139_92_246),rgb(217_70_239))]"
            />
            <span>{brand}</span>
          </Link>

          <ul className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="px-3 py-2 text-sm text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] transition-colors"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
              Sign in
            </Button>
            <Button size="sm">Get started</Button>
          </div>
        </nav>
      </Container>
    </header>
  );
}
