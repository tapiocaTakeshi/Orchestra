import { Button } from "@/components/ui/Button";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 grid-bg opacity-60" />
      <div className="container-px relative pt-20 sm:pt-28 pb-20 sm:pb-28">
        <div className="mx-auto max-w-3xl text-center animate-fadeUp">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 backdrop-blur px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-gradient" />
            New · v2.0 is here
          </span>

          <h1 className="mt-6 font-display text-4xl sm:text-6xl md:text-7xl font-semibold tracking-tight leading-[1.05]">
            Build delightful{" "}
            <span className="text-gradient">modern interfaces</span>{" "}
            with confidence.
          </h1>

          <p className="mt-6 text-base sm:text-lg leading-relaxed text-muted-foreground">
            A thoughtfully crafted design system focused on clarity, speed, and
            accessibility — so your product feels effortless from the first click.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" variant="secondary">
              Start building
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 10h10M11 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
            <Button size="lg" variant="outline">
              View documentation
            </Button>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Free forever · No credit card required
          </p>
        </div>

        {/* Showcase frame */}
        <div className="relative mx-auto mt-16 max-w-5xl animate-fadeUp [animation-delay:120ms]">
          <div className="absolute -inset-x-10 -inset-y-6 rounded-[2rem] bg-brand-gradient opacity-20 blur-3xl" />
          <div className="relative rounded-2xl border border-border bg-card/70 backdrop-blur-xl shadow-soft overflow-hidden">
            <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
              <span className="ml-3 text-xs text-muted-foreground font-mono">
                lumen.app/dashboard
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-background/60 p-4 animate-float"
                  style={{ animationDelay: `${i * 0.4}s` }}
                >
                  <div className="h-2 w-12 rounded-full bg-brand-gradient" />
                  <div className="mt-4 h-6 w-24 rounded bg-muted" />
                  <div className="mt-2 h-3 w-32 rounded bg-muted/60" />
                  <div className="mt-5 grid grid-cols-4 gap-1.5">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <div
                        key={j}
                        className="h-6 rounded bg-muted/70"
                        style={{ opacity: 0.4 + (j % 4) * 0.15 }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
