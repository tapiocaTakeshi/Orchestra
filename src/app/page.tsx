import { Container } from "@/components/Container";
import { Section } from "@/components/Section";
import { Button } from "@/components/Button";

export default function Home() {
  return (
    <main>
      {/* Header */}
      <header className="border-b hairline">
        <Container size="lg">
          <div className="flex h-16 items-center justify-between">
            <a href="/" className="text-sm font-medium tracking-tight">
              Minimal
            </a>
            <nav className="hidden md:flex items-center gap-8 text-sm text-muted">
              <a href="#work" className="hover:text-foreground transition-colors">
                Work
              </a>
              <a href="#about" className="hover:text-foreground transition-colors">
                About
              </a>
              <a href="#contact" className="hover:text-foreground transition-colors">
                Contact
              </a>
            </nav>
          </div>
        </Container>
      </header>

      {/* Hero */}
      <Section className="!pt-32 md:!pt-48">
        <Container>
          <p className="text-xs uppercase tracking-[0.2em] text-muted mb-8">
            01 — Introduction
          </p>
          <h1 className="text-4xl md:text-6xl tracking-tightest font-medium">
            Less, but better.
          </h1>
          <p className="mt-8 text-lg md:text-xl text-muted max-w-prose leading-relaxed">
            余白と静けさで、本当に伝えたいことだけを残す。
            装飾を削ぎ落としたミニマルなデザインで、コンテンツそのものに集中できる体験を。
          </p>
          <div className="mt-12 flex items-center gap-3">
            <Button>Get started</Button>
            <Button variant="ghost">Learn more</Button>
          </div>
        </Container>
      </Section>

      {/* Features */}
      <Section divider id="work">
        <Container size="lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16">
            {[
              {
                no: "01",
                title: "Clarity",
                body: "視覚的ノイズを最小化し、情報の階層を明確にします。",
              },
              {
                no: "02",
                title: "Space",
                body: "余白は装飾ではなく構造。要素の関係性を語ります。",
              },
              {
                no: "03",
                title: "Restraint",
                body: "色・線・タイポグラフィを最小限に保ち、本質を際立たせる。",
              },
            ].map((f) => (
              <div key={f.no}>
                <p className="text-xs text-muted tracking-[0.2em] mb-4">{f.no}</p>
                <h3 className="text-xl mb-3">{f.title}</h3>
                <p className="text-muted leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* About */}
      <Section divider id="about">
        <Container>
          <p className="text-xs uppercase tracking-[0.2em] text-muted mb-8">
            02 — About
          </p>
          <h2 className="text-3xl md:text-4xl tracking-tight mb-8">
            必要なものだけを、丁寧に。
          </h2>
          <div className="space-y-6 text-muted max-w-prose leading-relaxed">
            <p>
              私たちは、複雑さを増やすのではなく、削ぎ落とすことで価値を生み出します。
              タイポグラフィ、余白、色のバランスにこだわり、長く使える設計を目指しています。
            </p>
            <p>
              すべての要素には理由があり、すべての余白には意味があります。
            </p>
          </div>
        </Container>
      </Section>

      {/* Contact */}
      <Section divider id="contact">
        <Container>
          <p className="text-xs uppercase tracking-[0.2em] text-muted mb-8">
            03 — Contact
          </p>
          <h2 className="text-3xl md:text-4xl tracking-tight mb-8">
            Let&apos;s talk.
          </h2>
          <a
            href="mailto:hello@example.com"
            className="inline-block text-lg border-b hairline pb-1 hover:opacity-60 transition-opacity"
          >
            hello@example.com
          </a>
        </Container>
      </Section>

      {/* Footer */}
      <footer className="border-t hairline py-10">
        <Container size="lg">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-sm text-muted">
            <p>© {new Date().getFullYear()} Minimal.</p>
            <p>Designed with restraint.</p>
          </div>
        </Container>
      </footer>
    </main>
  );
}
