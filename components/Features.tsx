const items = [
  {
    n: "01",
    title: "Whitespace",
    body: "余白は装飾ではなく構造。読む速度と理解を整えるための主役です。",
  },
  {
    n: "02",
    title: "Typography",
    body: "1つの書体、限定的なウェイト。階層は文字サイズと間隔のみで作る。",
  },
  {
    n: "03",
    title: "Restraint",
    body: "色は黒と白、そして数段階の灰色。判断の数を意図的に減らす。",
  },
];

export default function Features() {
  return (
    <section id="features" className="w-full border-t border-[var(--border)]">
      <div className="mx-auto max-w-5xl px-6 py-24 md:py-32">
        <h2 className="text-2xl md:text-3xl font-light tracking-tight mb-16 max-w-xl">
          設計の三原則
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16">
          {items.map((it) => (
            <div key={it.n} className="flex flex-col">
              <span className="text-xs text-[var(--muted)] tracking-[0.2em] mb-6">
                {it.n}
              </span>
              <h3 className="text-base font-medium mb-3">{it.title}</h3>
              <p className="text-sm text-[var(--muted)] leading-relaxed">
                {it.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
