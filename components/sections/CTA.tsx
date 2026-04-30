import { Button } from "@/components/ui/Button";

export function CTA() {
  return (
    <section className="container-px pb-24 sm:pb-32">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card/70 backdrop-blur-xl p-10 sm:p-14 text-center shadow-soft">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-1 bg-brand-gradient opacity-20 blur-3xl"
        />
        <div className="relative">
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight">
            Ready to ship something{" "}
            <span className="text-gradient">beautiful</span>?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground leading-relaxed">
            Join thousands of teams building modern, accessible products today.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" variant="secondary">
              Start free
            </Button>
            <Button size="lg" variant="outline">
              Talk to sales
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
