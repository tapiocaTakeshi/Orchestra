import Container from "@/components/ui/Container";
import Button from "@/components/ui/Button";

export default function Hero() {
  return (
    <section className="border-b border-[hsl(var(--border))]">
      <Container className="py-28 md:py-40">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--muted))] mb-6">
            Introducing v1.0
          </p>
          <h1 className="text-4xl md:text-6xl font-medium tracking-tightest leading-[1.05]">
            Less interface.
            <br />
            <span className="text-[hsl(var(--muted))]">More clarity.</span>
          </h1>
          <p className="mt-8 text-base md:text-lg text-[hsl(var(--muted))] max-w-xl leading-relaxed">
            A quiet workspace built on whitespace, typography, and intention.
            Nothing more than what you need — and nothing in the way of what
            you make.
          </p>
          <div className="mt-12 flex items-center gap-3">
            <Button href="#get-started">Get started</Button>
            <Button href="#docs" variant="ghost">
              Read the docs →
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
