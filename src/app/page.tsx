import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { FeatureCard } from "@/components/FeatureCard";

const FEATURES = [
  {
    title: "Lightning fast",
    description:
      "Server components and edge rendering deliver content in milliseconds, anywhere.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Accessible by default",
    description:
      "Built on semantic HTML with focus states, reduced motion and color-contrast in mind.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="5" r="2" />
        <path d="M5 9h14M9 22l3-9 3 9M12 13V9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Designed to scale",
    description:
      "Composable primitives and design tokens keep your product cohesive as it grows.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <main id="main">
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="absolute inset-0 -z-10 bg-aurora" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-grid opacity-60" />

          <div className="container py-24 sm:py-32 lg:py-40">
            <div className="mx-auto max-w-3xl text-center animate-fade-up">
              <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                v2.0 — Refined for 2025
              </span>

              <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Build interfaces that feel{" "}
                <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  effortless
                </span>
                .
              </h1>

              <p className="mx-auto mt-5 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
                A modern toolkit of accessible, well-crafted components — designed
                to ship beautiful products faster, without compromising on quality.
              </p>

              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  id="cta"
                  href="#features"
                  className="inline-flex w-full items-center justify-center rounded-md bg-foreground px-5 py-3 text-sm font-medium text-background shadow-soft transition-transform hover:-translate-y-0.5 sm:w-auto"
                >
                  Get started — it&apos;s free
                </a>
                <a
                  href="#showcase"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card/60 px-5 py-3 text-sm font-medium backdrop-blur transition-colors hover:bg-muted sm:w-auto"
                >
                  View showcase
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </div>

              <p className="mt-6 text-xs text-muted-foreground">
                No credit card required · Cancel anytime
              </p>
            </div>

            {/* Floating preview card */}
            <div className="relative mx-auto mt-16 max-w-5xl">
              <div className="glass animate-float rounded-2xl p-2 shadow-soft">
                <div className="rounded-xl border border-border/60 bg-background/80 p-6 sm:p-10">
                  <div className="grid gap-4 sm:grid-cols-3">
                    {[
                      { k: "Active users", v: "128k", d: "+12.4%" },
                      { k: "Response time", v: "82ms", d: "-9.1%" },
                      { k: "Satisfaction", v: "4.9/5", d: "+0.2" },
                    ].map((s) => (
                      <div key={s.k} className="rounded-lg bg-muted/50 p-4">
                        <p className="text-xs text-muted-foreground">{s.k}</p>
                        <p className="mt-1 text-2xl font-semibold tracking-tight">{s.v}</p>
                        <p className="mt-1 text-xs text-primary">{s.d}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="container py-24 sm:py-32">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything you need, nothing you don&apos;t
            </h2>
            <p className="mt-3 text-muted-foreground">
              A focused set of features that help you ship with confidence.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </section>

        {/* CTA */}
        <section id="pricing" className="container pb-24 sm:pb-32">
          <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-10 sm:p-16">
            <div aria-hidden className="absolute inset-0 -z-10 bg-grid opacity-50" />
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Ready to ship something delightful?
              </h2>
              <p className="mt-3 text-muted-foreground">
                Start free. Upgrade when you&apos;re ready. No surprises.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href="#start"
                  className="inline-flex w-full items-center justify-center rounded-md bg-foreground px-5 py-3 text-sm font-medium text-background shadow-soft transition-transform hover:-translate-y-0.5 sm:w-auto"
                >
                  Start building
                </a>
                <a
                  href="#contact"
                  className="inline-flex w-full items-center justify-center rounded-md border border-border bg-card/60 px-5 py-3 text-sm font-medium backdrop-blur transition-colors hover:bg-muted sm:w-auto"
                >
                  Talk to us
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
