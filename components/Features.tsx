const features = [
  {
    title: "Lightning fast",
    desc: "Optimized rendering pipeline keeps interactions under 16ms — even on mid-range devices.",
    icon: "⚡",
    span: "md:col-span-2",
  },
  {
    title: "Accessible by default",
    desc: "WCAG 2.2 AA compliant components with full keyboard support.",
    icon: "♿",
    span: "md:col-span-1",
  },
  {
    title: "Beautifully themed",
    desc: "Token-based design system that adapts to light, dark, and brand modes.",
    icon: "🎨",
    span: "md:col-span-1",
  },
  {
    title: "Composable primitives",
    desc: "Headless building blocks you can shape to fit any product surface.",
    icon: "🧱",
    span: "md:col-span-2",
  },
];

export default function Features() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div className="container">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
            Why teams choose us
          </p>
          <h2 className="mt-3 font-display text-3xl sm:text-5xl font-semibold tracking-tight">
            Everything you need.{" "}
            <span className="text-gradient">Nothing you don&apos;t.</span>
          </h2>
          <p className="mt-4 text-[hsl(var(--muted-foreground))]">
            A focused set of tools that scale from solo projects to enterprise teams.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {features.map((f) => (
            <article
              key={f.title}
              className={`gradient-border group relative overflow-hidden rounded-2xl bg-[hsl(var(--card))] p-6 sm:p-8 shadow-soft transition-transform duration-300 hover:-translate-y-1 ${f.span}`}
            >
              <div className="flex items-center justify-center h-11 w-11 rounded-xl bg-[hsl(var(--muted))] text-xl">
                <span aria-hidden>{f.icon}</span>
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold tracking-tight">
                {f.title}
              </h3>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                {f.desc}
              </p>
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 -bottom-16 h-48 w-48 rounded-full bg-gradient-accent opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-20"
              />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
