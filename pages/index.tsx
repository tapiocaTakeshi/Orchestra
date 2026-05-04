import Head from "next/head";
import Header from "../components/Header";
import Footer from "../components/Footer";
import Section from "../components/Section";
import Container from "../components/Container";
import Button from "../components/Button";

const projects = [
  { id: "01", title: "Aether Identity", year: "2024", tag: "Brand" },
  { id: "02", title: "North Magazine", year: "2024", tag: "Editorial" },
  { id: "03", title: "Loom Commerce", year: "2023", tag: "Web" },
  { id: "04", title: "Quiet Hours", year: "2023", tag: "Product" },
];

export default function Home() {
  return (
    <>
      <Head>
        <title>Studio — Minimal Portfolio</title>
        <meta
          name="description"
          content="A small studio focused on calm, considered design."
        />
      </Head>

      <Header />

      <main>
        {/* Hero */}
        <section className="pt-32 pb-section md:pt-40 md:pb-section-lg">
          <Container>
            <p className="eyebrow mb-8">Independent Design Studio</p>
            <h1 className="max-w-4xl text-ink tracking-tightest leading-[1.05]">
              Quiet design,
              <br />
              for ideas worth keeping.
            </h1>
            <p className="mt-8 max-w-content text-lg text-muted leading-relaxed">
              We help thoughtful teams shape brands, products and stories with
              clarity and restraint. Less noise. More signal.
            </p>
            <div className="mt-12 flex items-center gap-6">
              <Button as="a" href="/work" variant="solid">
                See selected work
              </Button>
              <Button as="a" href="/contact" variant="ghost">
                Start a project
              </Button>
            </div>
          </Container>
        </section>

        {/* Selected Work */}
        <Section eyebrow="Selected Work" title="A small body of work, made with care.">
          <ul className="border-t border-line">
            {projects.map((p) => (
              <li
                key={p.id}
                className="border-b border-line group"
              >
                <a
                  href="#"
                  className="flex items-baseline justify-between py-8 md:py-10 transition-opacity duration-200 hover:opacity-60"
                >
                  <div className="flex items-baseline gap-6 md:gap-10">
                    <span className="text-sm text-muted tabular-nums w-8">
                      {p.id}
                    </span>
                    <span className="text-2xl md:text-3xl tracking-tight text-ink">
                      {p.title}
                    </span>
                  </div>
                  <div className="hidden md:flex items-baseline gap-10 text-sm text-muted">
                    <span>{p.tag}</span>
                    <span className="tabular-nums">{p.year}</span>
                    <span aria-hidden>→</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </Section>

        {/* About */}
        <Section
          eyebrow="About"
          title="A studio of two, working closely with a few clients each year."
          description="We believe good design is the result of patience, conversation and a willingness to remove rather than add. Our practice spans identity, editorial and digital product."
        >
          <div className="grid gap-12 md:grid-cols-3 mt-4">
            {[
              {
                k: "01",
                t: "Identity",
                d: "Wordmarks, systems and guidelines built to last beyond a launch.",
              },
              {
                k: "02",
                t: "Editorial",
                d: "Books, magazines and long-form digital with considered typography.",
              },
              {
                k: "03",
                t: "Product",
                d: "Calm interfaces designed around clarity, hierarchy and rhythm.",
              },
            ].map((s) => (
              <div key={s.k}>
                <p className="text-sm text-muted tabular-nums mb-4">{s.k}</p>
                <h3 className="text-ink tracking-tight mb-3">{s.t}</h3>
                <p className="text-muted leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* CTA */}
        <Section bordered>
          <div className="max-w-content">
            <h2 className="text-ink tracking-tighter">
              Have something in mind?
            </h2>
            <p className="mt-5 text-muted leading-relaxed">
              We take on a handful of new engagements per quarter. Tell us a
              little about your project and we will be in touch.
            </p>
            <div className="mt-10">
              <Button as="a" href="mailto:hello@example.com" variant="outline">
                hello@example.com
              </Button>
            </div>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
