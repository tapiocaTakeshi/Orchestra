import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Section from "@/components/Section";
import Button from "@/components/Button";

const work = [
  {
    year: "2025",
    title: "Atelier",
    description: "A writing tool that disappears while you think.",
  },
  {
    year: "2024",
    title: "Field Notes",
    description: "Daily journal, reduced to text and time.",
  },
  {
    year: "2024",
    title: "Quiet Type",
    description: "A typeface drawn for long reading.",
  },
  {
    year: "2023",
    title: "Paper",
    description: "An iPad sketchbook with no toolbar.",
  },
];

export default function Page() {
  return (
    <>
      <Header />

      {/* Hero */}
      <Section className="pt-32 pb-40 md:pt-48 md:pb-56">
        <div className="fade-up max-w-3xl">
          <p className="mb-8 text-sm uppercase tracking-[0.2em] text-muted">
            Studio · Est. 2020
          </p>
          <h1 className="text-4xl font-medium tracking-tight md:text-6xl">
            Less,
            <br />
            but better.
          </h1>
          <p className="mt-10 max-w-prose text-lg text-muted">
            We design quiet products around restraint, whitespace, and clarity —
            tools that step out of the way so the work can step forward.
          </p>
          <div className="mt-12 flex items-center gap-10">
            <Button href="#work">View selected work</Button>
            <Button href="#contact" variant="ghost">
              Get in touch
            </Button>
          </div>
        </div>
      </Section>

      {/* Work */}
      <Section className="border-t border-border py-24 md:py-32" >
        <div id="work" className="grid gap-16 md:grid-cols-[1fr_2fr]">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-muted">
              Selected Work
            </p>
          </div>
          <ul className="divide-y divide-border">
            {work.map((item) => (
              <li
                key={item.title}
                className="group grid grid-cols-[auto_1fr_auto] items-baseline gap-8 py-6 transition-opacity hover:opacity-60"
              >
                <span className="text-sm tabular-nums text-muted">
                  {item.year}
                </span>
                <div>
                  <h3 className="text-xl font-medium tracking-tight">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted">{item.description}</p>
                </div>
                <span
                  aria-hidden
                  className="text-muted transition-transform group-hover:translate-x-0.5"
                >
                  →
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* About */}
      <Section className="border-t border-border py-24 md:py-32">
        <div id="about" className="grid gap-16 md:grid-cols-[1fr_2fr]">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-muted">
              About
            </p>
          </div>
          <div className="max-w-prose space-y-6 text-lg">
            <p>
              We are a small studio working at the edge of design and software.
              Our practice favors what stays — typography, rhythm, and the way
              tools feel in the hand — over what shouts.
            </p>
            <p className="text-muted">
              Working with founders, writers, and institutions, we ship calm
              interfaces and honest brand systems. We take on a handful of
              projects each year, and write down what we learn.
            </p>
          </div>
        </div>
      </Section>

      {/* Contact */}
      <Section className="border-t border-border py-24 md:py-32">
        <div
          id="contact"
          className="grid gap-16 md:grid-cols-[1fr_2fr] md:items-end"
        >
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-muted">
              Contact
            </p>
          </div>
          <div>
            <h2 className="text-3xl font-medium tracking-tight md:text-4xl">
              Have something quiet to build?
            </h2>
            <p className="mt-6 max-w-prose text-muted">
              We respond to every note. Tell us a little about the work, the
              people, and the timeline.
            </p>
            <a
              href="mailto:hello@minimal.studio"
              className="mt-10 inline-block border-b border-foreground pb-1 text-lg tracking-tight transition-opacity hover:opacity-60"
            >
              hello@minimal.studio
            </a>
          </div>
        </div>
      </Section>

      <Footer />
    </>
  );
}
