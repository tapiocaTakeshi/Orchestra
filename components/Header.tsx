import Link from "next/link";
import Section from "./Section";

export default function Header() {
  return (
    <header className="border-b border-border">
      <Section as="header" className="flex h-16 items-center justify-between">
        <Link
          href="/"
          className="text-sm font-medium tracking-tight"
          aria-label="Home"
        >
          ◇ Minimal
        </Link>
        <nav className="flex items-center gap-8 text-sm text-muted">
          <Link href="#work" className="transition-opacity hover:opacity-60">
            Work
          </Link>
          <Link href="#about" className="transition-opacity hover:opacity-60">
            About
          </Link>
          <Link
            href="#contact"
            className="transition-opacity hover:opacity-60"
          >
            Contact
          </Link>
        </nav>
      </Section>
    </header>
  );
}
