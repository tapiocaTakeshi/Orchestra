"use client";

const conversations = [
  { id: "1", title: "Glassmorphism UI の作り方", time: "今" },
  { id: "2", title: "Tailwind 設計のベストプラクティス", time: "昨日" },
  { id: "3", title: "React Server Components", time: "2 日前" },
  { id: "4", title: "TypeScript ジェネリクス入門", time: "3 日前" },
  { id: "5", title: "アニメーションのアイデア", time: "先週" },
];

export default function Sidebar() {
  return (
    <aside className="glass hidden h-full w-72 shrink-0 flex-col overflow-hidden rounded-3xl md:flex">
      {/* ロゴ */}
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 via-indigo-400 to-fuchsia-500 text-sm font-black shadow-lg">
          ✦
        </div>
        <div>
          <p className="text-sm font-semibold">Aurora</p>
          <p className="text-[11px] text-white/50">AI Workspace</p>
        </div>
      </div>

      {/* 新規チャット */}
      <div className="px-4 pt-4">
        <button className="glass-soft flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-white transition hover:bg-white/15">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          新しいチャット
        </button>
      </div>

      {/* 履歴 */}
      <div className="glass-scroll mt-4 flex-1 overflow-y-auto px-3">
        <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
          履歴
        </p>
        <ul className="space-y-1">
          {conversations.map((c, i) => (
            <li key={c.id}>
              <button
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  i === 0
                    ? "bg-white/15 text-white"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="truncate">{c.title}</span>
                <span className="shrink-0 text-[10px] text-white/40">
                  {c.time}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* ユーザー */}
      <div className="border-t border-white/10 p-3">
        <div className="glass-soft flex items-center gap-3 rounded-xl p-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 text-xs font-bold">
            JD
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">Jane Doe</p>
            <p className="truncate text-[11px] text-white/50">Pro プラン</p>
          </div>
          <button
            aria-label="ログアウト"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
