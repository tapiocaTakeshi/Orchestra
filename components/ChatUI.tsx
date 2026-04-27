"use client";

import { useEffect, useRef, useState } from "react";

type Role = "user" | "assistant";
interface Message {
  id: string;
  role: Role;
  content: string;
  time: string;
}

const initialMessages: Message[] = [
  {
    id: "m1",
    role: "assistant",
    content: "こんにちは！何でも気軽に聞いてください ✨",
    time: "10:24",
  },
  {
    id: "m2",
    role: "user",
    content: "Glassmorphism のチャット UI のサンプルを見せて！",
    time: "10:25",
  },
  {
    id: "m3",
    role: "assistant",
    content:
      "もちろんです。半透明 + ぼかし + 淡いボーダーで、奥行きのあるガラス質感を表現しています。",
    time: "10:25",
  },
];

const now = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function ChatUI() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isTyping]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      time: now(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setIsTyping(true);

    // ダミー応答
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "（デモ応答）了解しました！ この UI は backdrop-filter を使ったガラス風デザインです。",
          time: now(),
        },
      ]);
      setIsTyping(false);
    }, 1100);
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-8">
      {/* 背景オーブ */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 flex w-full max-w-6xl h-[88vh] gap-4">
        {/* サイドバー */}
        <aside className="glass hidden md:flex flex-col w-72 rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-2xl glass-strong grid place-items-center">
              <span className="text-lg">✦</span>
            </div>
            <span className="font-semibold tracking-wide">Aurora AI</span>
          </div>

          <button className="glass-strong rounded-2xl py-2.5 px-4 text-sm font-medium hover:bg-white/20 transition mb-5">
            + 新しいチャット
          </button>

          <div className="text-xs uppercase tracking-wider text-white/60 mb-2">
            最近の会話
          </div>
          <ul className="space-y-1.5 scroll-area overflow-y-auto pr-1">
            {[
              "Glassmorphism の例",
              "Tailwind のヒント",
              "React Hooks の質問",
              "アイデアブレスト",
              "週末の旅行プラン",
            ].map((t, i) => (
              <li
                key={i}
                className={`px-3 py-2 rounded-xl cursor-pointer text-sm transition border border-transparent hover:border-white/15 hover:bg-white/10 ${
                  i === 0 ? "bg-white/10 border-white/15" : ""
                }`}
              >
                {t}
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-4 border-t border-white/10 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-400 to-violet-500" />
            <div className="text-sm">
              <div className="font-medium">Yuki</div>
              <div className="text-white/60 text-xs">Free plan</div>
            </div>
          </div>
        </aside>

        {/* メインチャット */}
        <main className="glass flex-1 rounded-3xl flex flex-col overflow-hidden">
          {/* ヘッダー */}
          <header className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-300/80 to-violet-500/80 grid place-items-center shadow-lg">
                <span className="text-lg">✦</span>
              </div>
              <div>
                <h1 className="font-semibold leading-tight">Aurora Assistant</h1>
                <p className="text-xs text-white/60 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  オンライン · GPT-style demo
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="glass-input rounded-xl px-3 py-1.5 text-xs hover:bg-white/15 transition">
                共有
              </button>
              <button className="glass-input rounded-xl px-3 py-1.5 text-xs hover:bg-white/15 transition">
                ⋯
              </button>
            </div>
          </header>

          {/* メッセージ一覧 */}
          <div
            ref={scrollRef}
            className="scroll-area flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-5"
          >
            {messages.map((m) => (
              <MessageBubble key={m.id} msg={m} />
            ))}
            {isTyping && (
              <div className="flex items-start gap-3">
                <Avatar role="assistant" />
                <div className="glass rounded-2xl rounded-tl-sm px-4 py-3">
                  <span className="typing-dot" />
                  <span className="typing-dot mx-1" />
                  <span className="typing-dot" />
                </div>
              </div>
            )}
          </div>

          {/* 入力欄 */}
          <div className="p-4 sm:p-5 border-t border-white/10">
            <div className="glass-input rounded-2xl flex items-end gap-2 px-3 py-2 transition">
              <button
                className="p-2 rounded-xl hover:bg-white/10 transition text-white/80"
                title="添付"
              >
                ＋
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                placeholder="メッセージを入力..."
                className="flex-1 bg-transparent outline-none resize-none py-2 px-1 max-h-40 placeholder-white/50"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="px-4 py-2 rounded-xl bg-gradient-to-br from-pink-400 to-violet-500 font-medium text-sm shadow-lg shadow-violet-500/30 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                送信 →
              </button>
            </div>
            <p className="text-[11px] text-white/50 mt-2 text-center">
              Aurora AI はミスをすることがあります。重要な情報は確認してください。
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

function Avatar({ role }: { role: Role }) {
  if (role === "assistant") {
    return (
      <div className="w-9 h-9 shrink-0 rounded-2xl bg-gradient-to-br from-cyan-300/80 to-violet-500/80 grid place-items-center shadow-md">
        <span>✦</span>
      </div>
    );
  }
  return (
    <div className="w-9 h-9 shrink-0 rounded-2xl bg-gradient-to-br from-pink-400 to-orange-300 grid place-items-center shadow-md text-sm font-semibold">
      Y
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <Avatar role={msg.role} />
      <div className={`flex flex-col max-w-[78%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={[
            "px-4 py-3 text-sm leading-relaxed rounded-2xl",
            isUser
              ? "glass-strong rounded-tr-sm bg-gradient-to-br from-white/20 to-white/5"
              : "glass rounded-tl-sm",
          ].join(" ")}
        >
          {msg.content}
        </div>
        <span className="text-[11px] text-white/50 mt-1 px-1">{msg.time}</span>
      </div>
    </div>
  );
}
