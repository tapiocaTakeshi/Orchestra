"use client";

import { useEffect, useRef, useState } from "react";

type Role = "user" | "assistant";
type Message = {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
};

const initialMessages: Message[] = [
  {
    id: "m1",
    role: "assistant",
    content:
      "こんにちは！ Glassmorphism デザインの AI チャットへようこそ。なんでも聞いてください ✨",
    createdAt: Date.now() - 1000 * 60 * 4,
  },
  {
    id: "m2",
    role: "user",
    content: "このUIのコンセプトを教えて。",
    createdAt: Date.now() - 1000 * 60 * 3,
  },
  {
    id: "m3",
    role: "assistant",
    content:
      "半透明のガラス板を重ねたような奥行き表現が特徴です。背景のカラフルなオーブを backdrop-filter でぼかし、白の薄い境界線で“ガラスの縁”を演出しています。",
    createdAt: Date.now() - 1000 * 60 * 2,
  },
];

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });

export default function GlassChat() {
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

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // モック応答（実APIに差し替え可）
    await new Promise((r) => setTimeout(r, 900));
    const reply: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content:
        "受け取りました。ガラスの向こうから返答します — 「" +
        text +
        "」について整理しますね。",
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, reply]);
    setIsTyping(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="glass-stage">
      {/* 背景のカラフルなオーブ */}
      <div className="glass-orb glass-orb--a" aria-hidden />
      <div className="glass-orb glass-orb--b" aria-hidden />
      <div className="glass-orb glass-orb--c" aria-hidden />
      <div className="glass-grid" aria-hidden />

      <div className="glass-shell">
        {/* サイドバー */}
        <aside className="glass-panel glass-sidebar">
          <div className="glass-brand">
            <div className="glass-logo" aria-hidden>
              <span />
            </div>
            <div>
              <p className="glass-brand__title">Aurora AI</p>
              <p className="glass-brand__sub">Glass Edition</p>
            </div>
          </div>

          <button className="glass-btn glass-btn--primary">
            <span>＋</span> 新しいチャット
          </button>

          <nav className="glass-nav">
            <p className="glass-nav__label">最近の会話</p>
            <ul>
              <li className="glass-nav__item is-active">
                <span className="dot" /> Glassmorphism のコンセプト
              </li>
              <li className="glass-nav__item">
                <span className="dot" /> Next.js のパフォーマンス
              </li>
              <li className="glass-nav__item">
                <span className="dot" /> 配色パレットの提案
              </li>
              <li className="glass-nav__item">
                <span className="dot" /> マイクロインタラクション
              </li>
            </ul>
          </nav>

          <div className="glass-user">
            <div className="glass-avatar" aria-hidden>
              U
            </div>
            <div>
              <p className="glass-user__name">You</p>
              <p className="glass-user__plan">Pro Plan</p>
            </div>
          </div>
        </aside>

        {/* メイン */}
        <section className="glass-panel glass-main">
          <header className="glass-header">
            <div>
              <h1 className="glass-title">AI チャット</h1>
              <p className="glass-subtitle">
                <span className="glass-status" /> オンライン・GPT-Glass 4o
              </p>
            </div>
            <div className="glass-header__actions">
              <button className="glass-icon-btn" title="共有">⌁</button>
              <button className="glass-icon-btn" title="設定">⚙</button>
            </div>
          </header>

          <div className="glass-messages" ref={scrollRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`glass-row glass-row--${m.role}`}
              >
                {m.role === "assistant" && (
                  <div className="glass-avatar glass-avatar--ai" aria-hidden>
                    AI
                  </div>
                )}
                <div className={`glass-bubble glass-bubble--${m.role}`}>
                  <p>{m.content}</p>
                  <span className="glass-bubble__time">
                    {formatTime(m.createdAt)}
                  </span>
                </div>
                {m.role === "user" && (
                  <div className="glass-avatar" aria-hidden>
                    U
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="glass-row glass-row--assistant">
                <div className="glass-avatar glass-avatar--ai" aria-hidden>
                  AI
                </div>
                <div className="glass-bubble glass-bubble--assistant glass-typing">
                  <span /> <span /> <span />
                </div>
              </div>
            )}
          </div>

          <footer className="glass-composer">
            <div className="glass-composer__inner">
              <button className="glass-icon-btn" title="添付">＋</button>
              <textarea
                rows={1}
                placeholder="メッセージを入力 (Enter で送信、Shift+Enter で改行)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
              />
              <button
                className="glass-send"
                onClick={handleSend}
                disabled={!input.trim()}
                title="送信"
              >
                ➤
              </button>
            </div>
            <p className="glass-hint">
              AI は誤った情報を生成することがあります。重要な情報は確認してください。
            </p>
          </footer>
        </section>
      </div>
    </div>
  );
}
