export default function Hero() {
  return (
    <section className="w-full">
      <div className="mx-auto max-w-5xl px-6 py-32 md:py-40">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)] mb-8">
          Introducing
        </p>
        <h1 className="text-4xl md:text-6xl font-light tracking-tight leading-[1.05] max-w-3xl">
          Less interface.
          <br />
          <span className="text-[var(--muted)]">More clarity.</span>
        </h1>
        <p className="mt-8 max-w-xl text-base md:text-lg text-[var(--muted)] leading-relaxed">
          余白とタイポグラフィだけで語る、必要最小限の体験。装飾を削ぎ落とし、
          コンテンツそのものに集中できるデザインを。
        </p>
        <div className="mt-12 flex items-center gap-6">
          <a
            href="#features"
            className="inline-flex items-center text-sm font-medium border-b border-[var(--foreground)] pb-1 hover:opacity-60 transition-opacity"
          >
            Get started →
          </a>
          <a
            href="#about"
            className="inline-flex items-center text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            Learn more
          </a>
        </div>
      </div>
    </section>
  );
}
