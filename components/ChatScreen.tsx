"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
};

const initialMessages: Message[] = [
  {
    id: "1",
    role: "assistant",
    content:
      "こんにちは！Glassmorphism デザインの AI アシスタントです。何でも聞いてください ✨",
    time: "10:24",
  },
  {
    id: "2",
    role: "user",
    content: "ガラス風のUIってどうやって作るの？",
    time: "10:25",
  },
  {
    id: "3",
    role: "assistant",
    content:
      "半透明の背景 + backdrop-filter: blur() + 微細なボーダーが基本です。背景にカラフルなグラデーションを置くとより映えますよ。",
    time: "10:25",
  },
];

const conversations = [
  { id: "c1", title: "Glassmorphism の作り方", active: true },
  { id: "c2", title: "Tailwind のカスタマイズ" },
  { id: "c3", title: "Next.js App Router 入門" },
  { id: "c4", title: "TypeScript の型パズル" },
  { id: "c5", title: "デザインシステムについて" },
];

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  const send = () => {
    const text = input.trim();
    if (!text || sending) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      time,
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setSending(true);

    // モック応答
    setTimeout(() => {
      const reply: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "なるほど！「" +
          text +
          "」について考えてみました。Glassmorphism の世界へようこそ 🪟✨",
        time,
      };
      setMessages((m) => [...m, reply]);
      setSending(false);
    }, 900);
  };

  return (
    <main className="relative z-10 flex h-screen w-full items-stretch gap-4 p-4 md:p-6">
      {/* サイドバー */}
      <aside className="glass hidden w-72 shrink-0 flex-col rounded-3xl p-4 md:flex">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-400 to-violet-500 shadow-lg">
            <span className="text-lg">✨</span>
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Aurora AI</p>
            <p className="text-xs text-white/60">Glass Edition</p>
          </div>
        </div>

        <button className="glass-strong mt-3 flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition hover:bg-white/20">
          <span className="text-lg leading-none">＋</span>
          新しいチャット
        </button>

        <div className="mt-5 px-2 text-[11px] uppercase tracking-widest text-white/50">
          履歴
        </div>
        <nav className="mt-2 flex-1 space-y-1 overflow-y-auto pr-1">
          {conversations.map((c) => (
            <button
              key={c.id}
              className={`w-full truncate rounded-xl px-3 py-2.5 text-left text-sm transition ${
                c.active
                  ? "glass-strong text-white"
                  : "text-white/75 hover:bg-white/10"
              }`}
            >
              💬 {c.title}
            </button>
          ))}
        </nav>

        <div className="glass mt-3 flex items-center gap-3 rounded-2xl p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-emerald-400 text-sm font-bold">
            U
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">User</p>
            <p className="truncate text-xs text-white/60">Free plan</p>
          </div>
          <button className="rounded-lg p-1.5 text-white/70 hover:bg-white/10">
            ⚙
          </button>
        </div>
      </aside>

      {/* メイン */}
      <section className="glass relative flex flex-1 flex-col overflow-hidden rounded-3xl">
        {/* ヘッダー */}
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4 md:px-7">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-400 via-violet-400 to-sky-400 shadow-lg">
                🤖
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white/30 bg-emerald-400" />
            </div>
            <div>
              <h1 className="text-base font-semibold md:text-lg">
                Aurora Assistant
              </h1>
              <p className="text-xs text-white/60">
                {sending ? "入力中…" : "オンライン"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="glass rounded-xl px-3 py-2 text-xs font-medium transition hover:bg-white/15">
              🔍
            </button>
            <button className="glass rounded-xl px-3 py-2 text-xs font-medium transition hover:bg-white/15">
              ⋯
            </button>
          </div>
        </header>

        {/* メッセージリスト */}
        <div
          ref={scrollRef}
          className="flex-1 space-y-5 overflow-y-auto px-4 py-6 md:px-8"
        >
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))}
          {sending && <TypingBubble />}
        </div>

        {/* 入力エリア */}
        <footer className="border-t border-white/10 p-3 md:p-5">
          <div className="glass-strong flex items-end gap-2 rounded-2xl p-2">
            <button
              type="button"
              className="rounded-xl p-2.5 text-white/75 transition hover:bg-white/10"
              title="添付"
            >
              📎
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="メッセージを入力…  (Shift+Enter で改行)"
              className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-white placeholder-white/50 outline-none"
            />
            <button
              type="button"
              className="rounded-xl p-2.5 text-white/75 transition hover:bg-white/10"
              title="音声"
            >
              🎙
            </button>
            <button
              onClick={send}
              disabled={!input.trim() || sending}
              className="rounded-xl bg-gradient-to-br from-pink-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              送信
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-white/45">
            AI は誤った情報を生成することがあります。重要な情報は確認してください。
          </p>
        </footer>
      </section>
    </main>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div
      className={`flex items-end gap-3 ${
        isUser ? "flex-row-reverse" : "flex-row"
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl shadow-md ${
          isUser
            ? "bg-gradient-to-br from-sky-400 to-emerald-400 text-sm font-bold"
            : "bg-gradient-to-br from-fuchsia-400 via-violet-400 to-sky-400"
        }`}
      >
        {isUser ? "U" : "🤖"}
      </div>
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-md ${
          isUser ? "glass-bubble-user" : "glass-bubble-ai"
        }`}
      >
        <p className="whitespace-pre-wrap">{msg.content}</p>
        <p
          className={`mt-1.5 text-[10px] ${
            isUser ? "text-white/70" : "text-white/55"
          } ${isUser ? "text-right" : "text-left"}`}
        >
          {msg.time}
        </p>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex items-end gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-400 via-violet-400 to-sky-400 shadow-md">
        🤖
      </div>
      <div className="glass-bubble-ai rounded-2xl px-4 py-3 shadow-md">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-white/70 [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-white/70 [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-white/70" />
        </div>
      </div>
    </div>
  );
}
