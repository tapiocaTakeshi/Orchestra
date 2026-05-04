export default function CTA() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="container">
        <div className="relative overflow-hidden rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-14 sm:px-12 sm:py-20 text-center shadow-soft">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 opacity-60"
            style={{
              background:
                "radial-gradient(60% 60% at 50% 0%, hsl(262 83% 58% / 0.18), transparent 70%), radial-gradient(60% 60% at 100% 100%, hsl(217 91% 60% / 0.18), transparent 70%)",
            }}
          />
          <h2 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight">
            Ready to ship something{" "}
            <span className="text-gradient">remarkable?</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[hsl(var(--muted-foreground))]">
            Start free. No credit card required. Upgrade whenever you&apos;re ready.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="#start"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-accent px-6 py-3 text-sm font-medium text-white shadow-soft hover:shadow-glow transition-shadow"
            >
              Get started — it&apos;s free
            </a>
            <a
              href="#contact"
              className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] px-6 py-3 text-sm font-medium hover:bg-[hsl(var(--muted))] transition-colors"
            >
              Talk to sales
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
