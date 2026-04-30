import { Card } from "@/components/ui/Card";

const FEATURES = [
  {
    title: "Lightning fast",
    desc: "Optimized rendering and zero-runtime styles for instant interactions.",
    icon: (
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    ),
  },
  {
    title: "Accessible by default",
    desc: "WCAG-compliant colors, focus states, and keyboard navigation built-in.",
    icon: (
      <>
        <circle cx="12" cy="6" r="2" />
        <path d="M5 11h14M9 11v10M15 11v10" />
      </>
    ),
  },
  {
    title: "Themeable tokens",
    desc: "Dark mode and brand theming via CSS variables — no rebuild required.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 0 0 18Z" />
      </>
    ),
  },
  {
    title: "Composable primitives",
    desc: "Headless, unopinionated components that fit your design system.",
    icon: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
  },
  {
    title: "Motion that matters",
    desc: "Subtle, purposeful animations that respect user preferences.",
    icon: (
      <>
        <path d="M3 12c4-8 14-8 18 0" />
        <path d="M3 12c4 8 14 8 18 0" />
      </>
    ),
  },
  {
    title: "DX you'll love",
    desc: "Type-safe APIs, sensible defaults, and zero boilerplate.",
    icon: (
      <>
        <path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16" />
      </>
    ),
  },
];

export function Features() {
  return (
    <section id="features" className="container-px py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium text-gradient">Why teams choose us</p>
        <h2 className="mt-3 font-display text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight">
          Designed for the details that matter
        </h2>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          Every primitive is engineered with care — so your team can focus on
          building experiences, not fighting the framework.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {FEATURES.map((f) => (
          <Card key={f.title} interactive>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden
              >
                {f.icon}
              </svg>
            </div>
            <h3 className="mt-5 font-display text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {f.desc}
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}
