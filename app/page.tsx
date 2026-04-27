"use client"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"

/* ────────── types ────────── */
type Role = "user" | "assistant"
interface Msg {
  id: string
  role: Role
  text: string
  ts: number
}

/* ────────── seed data ────────── */
const seed: Msg[] = [
  { id: "s1", role: "assistant", text: "こんにちは 👋 何でも聞いてください。", ts: Date.now() - 300000 },
  { id: "s2", role: "user", text: "Glassmorphism のチャット UI を見せて！", ts: Date.now() - 240000 },
  { id: "s3", role: "assistant", text: "もちろん。半透明レイヤー＋ぼかし＋細いライトボーダーで、光が透けるガラスのような質感を演出しています ✨", ts: Date.now() - 180000 },
]

const fmt = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

/* ────────── page ────────── */
export default function Page() {
  const [msgs, setMsgs] = useState<Msg[]>(seed)
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" })
  }, [msgs, busy])

  const send = () => {
    const t = input.trim()
    if (!t || busy) return
    const m: Msg = { id: crypto.randomUUID(), role: "user", text: t, ts: Date.now() }
    setMsgs(p => [...p, m])
    setInput("")
    setBusy(true)
    setTimeout(() => {
      setMsgs(p => [
        ...p,
        { id: crypto.randomUUID(), role: "assistant", text: `了解しました！「${t}」についてお手伝いします 💎`, ts: Date.now() },
      ])
      setBusy(false)
    }, 1000)
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#06050e]">
      {/* ── background orbs ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
        <div className="animate-float-slow absolute -left-32 -top-32 h-[560px] w-[560px] rounded-full bg-violet-600/50 mix-blend-screen blur-[140px]" />
        <div className="animate-float-mid  absolute -right-40 top-1/4 h-[480px] w-[480px] rounded-full bg-fuchsia-500/40 mix-blend-screen blur-[120px]" />
        <div className="animate-float-fast absolute bottom-[-120px] left-1/3 h-[420px] w-[420px] rounded-full bg-cyan-400/35 mix-blend-screen blur-[110px]" />
        <div className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 bg-[radial-gradient(ellipse,rgba(168,85,247,.15),transparent_70%)]" />
      </div>

      <div className="relative z-10 mx-auto flex h-full max-w-[1360px] gap-5 p-4 md:p-6">
        {/* ── Sidebar ── */}
        <aside className="noise glass hidden w-[280px] flex-col rounded-[28px] md:flex">
          {/* logo */}
          <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
            <div className="animate-pulse-glow flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 to-fuchsia-500 text-lg shadow-lg shadow-violet-500/30">
              ✦
            </div>
            <div>
              <p className="text-[15px] font-semibold tracking-wide">Aurora</p>
              <p className="text-[11px] text-white/50">Glass Edition</p>
            </div>
          </div>

          {/* new chat */}
          <div className="px-4 pt-4">
            <button className="glass-strong group flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-medium transition hover:bg-white/20 hover:shadow-lg hover:shadow-violet-500/10">
              <span className="text-base transition group-hover:rotate-90">＋</span>
              新しいチャット
            </button>
          </div>

          {/* history */}
          <p className="mt-5 px-5 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">会話履歴</p>
          <nav className="glass-scroll mt-2 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
            {["Glassmorphism デザイン", "React Hooks の最適化", "旅行プラン相談", "TypeScript Generics", "UI アニメーション"].map((t, i) => (
              <button
                key={i}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition ${
                  i === 0
                    ? "bg-white/12 text-white shadow-sm shadow-white/5"
                    : "text-white/65 hover:bg-white/8 hover:text-white/90"
                }`}
              >
                <span className="text-white/40 transition group-hover:text-white/70">💬</span>
                <span className="truncate">{t}</span>
              </button>
            ))}
          </nav>

          {/* user */}
          <div className="border-t border-white/8 p-3">
            <div className="glass-subtle flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-white/8">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-xs font-bold shadow-md">
                YU
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">You</p>
                <p className="truncate text-[11px] text-white/45">Free plan</p>
              </div>
              <button className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white/80">⚙</button>
            </div>
          </div>
        </aside>

        {/* ── Main chat ── */}
        <main className="noise glass flex flex-1 flex-col overflow-hidden rounded-[28px]">
          {/* header */}
          <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 via-fuchsia-400 to-pink-400 shadow-xl shadow-fuchsia-500/20">
                  <span className="text-xl">✦</span>
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-[#080714] bg-emerald-400">
                  <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-300" />
                </span>
              </div>
              <div>
                <h1 className="text-[15px] font-semibold tracking-wide">Aurora Assistant</h1>
                <p className="text-xs text-white/50">{busy ? "思考中…" : "オンライン"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-300 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Connected
              </span>
            </div>
          </header>

          {/* messages */}
          <div ref={ref} className="glass-scroll flex-1 space-y-5 overflow-y-auto px-5 py-6 md:px-8">
            {msgs.map((m, i) => (
              <div key={m.id} className="animate-fade-up" style={{ animationDelay: `${i * 0.04}s` }}>
                <Bubble msg={m} />
              </div>
            ))}
            {busy && (
              <div className="animate-fade-up flex items-end gap-3">
                <Ava role="assistant" />
                <div className="glass rounded-2xl rounded-bl-md px-5 py-3">
                  <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                </div>
              </div>
            )}
          </div>

          {/* composer */}
          <div className="border-t border-white/10 p-4 md:px-6">
            <div className="glass-strong flex items-end gap-2 rounded-2xl p-2 transition focus-within:border-white/40 focus-within:shadow-[0_0_0_4px_rgba(168,85,247,0.12)]">
              <button aria-label="attach" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/60 transition hover:bg-white/10 hover:text-white/90">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </button>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                rows={1}
                placeholder="メッセージを入力…  (Enter で送信)"
                className="max-h-36 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm leading-relaxed text-white placeholder:text-white/40 focus:outline-none"
              />
              <button
                onClick={send}
                disabled={!input.trim() || busy}
                className="group flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/30 transition enabled:hover:scale-105 enabled:hover:shadow-fuchsia-500/50 disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="送信"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition group-hover:translate-x-0.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-white/35">
              AI は誤った情報を生成する場合があります。重要な内容はご確認ください。
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}

/* ────────── sub components ────────── */

function Ava({ role }: { role: Role }) {
  return role === "assistant" ? (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 via-fuchsia-400 to-pink-400 shadow-md shadow-fuchsia-500/20">
      <span className="text-sm">✦</span>
    </div>
  ) : (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-xs font-bold shadow-md shadow-cyan-500/20">
      YU
    </div>
  )
}

function Bubble({ msg }: { msg: Msg }) {
  const u = msg.role === "user"
  return (
    <div className={`flex items-end gap-3 ${u ? "flex-row-reverse" : ""}`}>
      <Ava role={msg.role} />
      <div className={`flex max-w-[75%] flex-col ${u ? "items-end" : "items-start"}`}>
        <div
          className={[
            "rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed",
            u
              ? "rounded-br-md border border-white/20 bg-gradient-to-br from-violet-500/50 to-fuchsia-500/40 text-white shadow-lg shadow-fuchsia-500/10 backdrop-blur-xl"
              : "glass rounded-bl-md text-white/95",
          ].join(" ")}
        >
          <p className="whitespace-pre-wrap break-words">{msg.text}</p>
        </div>
        <span className="mt-1 px-1 text-[10px] text-white/40">{fmt(msg.ts)}</span>
      </div>
    </div>
  )
}
