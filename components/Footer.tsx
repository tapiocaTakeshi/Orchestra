const cols = [
  {
    title: "Product",
    links: ["Features", "Pricing", "Changelog", "Roadmap"],
  },
  {
    title: "Company",
    links: ["About", "Blog", "Careers", "Contact"],
  },
  {
    title: "Resources",
    links: ["Docs", "Guides", "Community", "Support"],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-[hsl(var(--border))] py-14">
      <div className="container">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
              <span aria-hidden className="h-6 w-6 rounded-md bg-gradient-accent" />
              Acme
            </div>
            <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))] max-w-xs">
              Crafting modern, accessible interfaces for ambitious teams.
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="text-sm font-semibold">{c.title}</h4>
              <ul className="mt-3 space-y-2">
                {c.links.map((l) => (
                  <li key={l}>
                    <a
                      href={`#${l.toLowerCase()}`}
                      className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                    >
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[hsl(var(--border))] pt-6">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            © {new Date().getFullYear()} Acme, Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))]">
            <a href="#privacy" className="hover:text-[hsl(var(--foreground))]">Privacy</a>
            <a href="#terms" className="hover:text-[hsl(var(--foreground))]">Terms</a>
            <a href="#status" className="hover:text-[hsl(var(--foreground))]">Status</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
