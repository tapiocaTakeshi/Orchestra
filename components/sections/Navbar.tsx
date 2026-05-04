import Link from "next/link";
import { Button } from "@/components/ui/Button";

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#docs", label: "Docs" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="container-px mt-4">
        <nav
          aria-label="Primary"
          className="glass rounded-full flex items-center justify-between px-4 sm:px-5 py-2.5 shadow-soft"
        >
          <Link href="/" className="flex items-center gap-2 ring-focus rounded-full px-2 py-1">
            <span
              aria-hidden
              className="h-7 w-7 rounded-lg bg-brand-gradient shadow-glow"
            />
            <span className="font-display text-base font-semibold tracking-tight">
              Lumen
            </span>
          </Link>

          <ul className="hidden md:flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-full ring-focus"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <Link
              href="#login"
              className="hidden sm:inline-flex text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-full ring-focus"
            >
              Log in
            </Link>
            <Button size="sm" variant="secondary" className="hidden sm:inline-flex">
              Get started
            </Button>
          </div>
        </nav>
      </div>
    </header>
  );
}
