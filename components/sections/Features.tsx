import Container from "@/components/ui/Container";

const features = [
  {
    n: "01",
    title: "Focused by default",
    body: "A single column, generous spacing, and a typographic scale that disappears so your content can speak.",
  },
  {
    n: "02",
    title: "Quiet motion",
    body: "Animation is reserved for feedback, never decoration. Interfaces feel calm, predictable and fast.",
  },
  {
    n: "03",
    title: "System-aware",
    body: "Respects your OS theme, reduced-motion settings, and reading preferences without configuration.",
  },
  {
    n: "04",
    title: "Built on the platform",
    body: "Semantic HTML, accessible primitives, and progressive enhancement — readable without JavaScript.",
  },
];

export default function Features() {
  return (
    <section id="features" className="border-b border-[hsl(var(--border))]">
      <Container className="py-24 md:py-32">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-16">
          <div className="md:col-span-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--muted))] mb-4">
              Principles
            </p>
            <h2 className="text-2xl md:text-3xl font-medium tracking-tight leading-tight">
              Designed to step out of your way.
            </h2>
          </div>

          <ul className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-12">
            {features.map((f) => (
              <li key={f.n} className="border-t border-[hsl(var(--border))] pt-6">
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="text-xs text-[hsl(var(--muted))] tabular-nums">
                    {f.n}
                  </span>
                  <h3 className="text-base font-medium tracking-tight">
                    {f.title}
                  </h3>
                </div>
                <p className="text-sm text-[hsl(var(--muted))] leading-relaxed">
                  {f.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
