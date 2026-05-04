export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-24 sm:pt-40 sm:pb-32">
      {/* decorative blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-gradient-accent opacity-20 blur-3xl animate-blob" />
        <div className="absolute right-[-10%] top-40 h-[380px] w-[380px] rounded-full bg-fuchsia-400/20 blur-3xl animate-blob" />
        <div className="absolute inset-0 grid-bg opacity-60 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_75%)]" />
      </div>

      <div className="container text-center">
        <a
          href="#changelog"
          className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))]/60 px-3 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))] backdrop-blur animate-fade-up"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-gradient-accent" />
          New · v2.0 is here
          <span aria-hidden>→</span>
        </a>

        <h1 className="mt-6 font-display text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-tightest leading-[1.05] animate-fade-up [animation-delay:80ms]">
          Build something
          <br className="hidden sm:block" />{" "}
          <span className="text-gradient">truly modern.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-base sm:text-lg text-[hsl(var(--muted-foreground))] animate-fade-up [animation-delay:160ms]">
          A thoughtfully designed toolkit that helps your team ship beautiful,
          accessible interfaces — faster than ever.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-up [animation-delay:240ms]">
          <a
            href="#start"
            className="group inline-flex items-center gap-2 rounded-full bg-gradient-accent px-6 py-3 text-sm font-medium text-white shadow-soft hover:shadow-glow transition-shadow"
          >
            Start building free
            <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
          </a>
          <a
            href="#demo"
            className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-3 text-sm font-medium hover:bg-[hsl(var(--muted))] transition-colors"
          >
            <span aria-hidden>▶</span> Watch demo
          </a>
        </div>

        {/* Social proof */}
        <div className="mt-16 animate-fade-up [animation-delay:320ms]">
          <p className="text-xs uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
            Trusted by teams at
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">
            {["Linear", "Vercel", "Stripe", "Notion", "Figma", "Raycast"].map((b) => (
              <span
                key={b}
                className="font-display text-base sm:text-lg font-semibold tracking-tight"
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
