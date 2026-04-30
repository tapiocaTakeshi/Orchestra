import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="container-px py-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="h-7 w-7 rounded-lg bg-brand-gradient" aria-hidden />
            <span className="font-display font-semibold">Lumen</span>
            <span className="ml-2 text-xs text-muted-foreground">
              © {new Date().getFullYear()} All rights reserved.
            </span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {["Privacy", "Terms", "Contact", "GitHub"].map((label) => (
              <Link
                key={label}
                href="#"
                className="text-muted-foreground hover:text-foreground transition-colors ring-focus rounded"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
