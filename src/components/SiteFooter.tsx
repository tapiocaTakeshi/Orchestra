import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="container py-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span
                aria-hidden
                className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-primary to-accent"
              />
              <span>Modern</span>
            </Link>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              A modern, accessible, and delightful experience built with Next.js
              and Tailwind CSS.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Product</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><a className="hover:text-foreground" href="#features">Features</a></li>
              <li><a className="hover:text-foreground" href="#pricing">Pricing</a></li>
              <li><a className="hover:text-foreground" href="#changelog">Changelog</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Company</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><a className="hover:text-foreground" href="#about">About</a></li>
              <li><a className="hover:text-foreground" href="#contact">Contact</a></li>
              <li><a className="hover:text-foreground" href="#privacy">Privacy</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Modern. All rights reserved.</p>
          <p>Crafted with care.</p>
        </div>
      </div>
    </footer>
  );
}
