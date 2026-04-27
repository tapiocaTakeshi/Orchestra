"use client";

import { useEffect, useRef, useState } from "react";
import Sidebar from "./Sidebar";
import MessageBubble, { ChatMessage } from "./MessageBubble";
import ChatInput from "./ChatInput";

const initialMessages: ChatMessage[] = [
  {
    id: "m1",
    role: "assistant",
    content:
      "こんにちは！✨ 私はあなたの AI アシスタントです。何でも気軽に聞いてください。",
    createdAt: new Date().toISOString(),
  },
  {
    id: "m2",
    role: "user",
    content: "Glassmorphism なチャット画面のサンプルを見せて！",
    createdAt: new Date().toISOString(),
  },
  {
    id: "m3",
    role: "assistant",
    content:
      "もちろん。半透明レイヤーと背景のぼかしを組み合わせて、奥行きのあるガラス風 UI を構成します。",
    createdAt: new Date().toISOString(),
  },
];

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isThinking, setIsThinking] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isThinking]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);

    // ダミー応答（実 API に差し替え可能）
    await new Promise((r) => setTimeout(r, 900));
    const reply: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content:
        "なるほど、了解しました。もう少し詳しく教えてもらえますか？✨（このメッセージはデモ応答です）",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, reply]);
    setIsThinking(false);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden p-4 md:p-6">
      {/* 中央のもう一つのカラフルブロブ */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-[40vmax] w-[40vmax] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, #06b6d4 0%, transparent 60%)",
        }}
      />

      <div className="mx-auto flex h-full max-w-7xl gap-4 md:gap-6">
        {/* サイドバー */}
        <Sidebar />

        {/* メインチャット領域 */}
        <main className="glass flex h-full flex-1 flex-col overflow-hidden rounded-3xl">
          {/* ヘッダー */}
          <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400/80 to-fuchsia-500/80 text-lg font-bold shadow-lg">
                  AI
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white/30 bg-emerald-400" />
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-wide text-white">
                  Aurora Assistant
                </h1>
                <p className="text-xs text-white/60">オンライン · GPT-like</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <IconButton label="検索">
                <SearchIcon />
              </IconButton>
              <IconButton label="設定">
                <CogIcon />
              </IconButton>
              <IconButton label="メニュー">
                <DotsIcon />
              </IconButton>
            </div>
          </header>

          {/* メッセージ */}
          <div
            ref={scrollerRef}
            className="glass-scroll flex-1 space-y-5 overflow-y-auto px-4 py-6 md:px-8"
          >
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {isThinking && <TypingIndicator />}
          </div>

          {/* 入力 */}
          <ChatInput onSend={handleSend} disabled={isThinking} />
        </main>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400/80 to-fuchsia-500/80 text-sm font-bold">
        AI
      </div>
      <div className="glass-soft flex items-center gap-1.5 rounded-2xl rounded-bl-sm px-4 py-3">
        <Dot delay="0s" />
        <Dot delay="0.15s" />
        <Dot delay="0.3s" />
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-2 w-2 animate-bounce rounded-full bg-white/70"
      style={{ animationDelay: delay }}
    />
  );
}

function IconButton({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      aria-label={label}
      className="glass-soft flex h-9 w-9 items-center justify-center rounded-xl text-white/80 transition hover:bg-white/15 hover:text-white"
    >
      {children}
    </button>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function CogIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
