"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./glassmorphism.module.css";

type Role = "user" | "ai";
interface Message {
  id: number;
  role: Role;
  content: string;
}

const initialMessages: Message[] = [
  {
    id: 1,
    role: "ai",
    content:
      "こんにちは！✨ 私はあなたのAIアシスタントです。どんなことでもお気軽に聞いてください。",
  },
  {
    id: 2,
    role: "user",
    content: "Glassmorphismっておしゃれだよね。少し試したい。",
  },
  {
    id: 3,
    role: "ai",
    content:
      "ありがとうございます！透過とぼかしを使うことで、奥行きと軽やかさを同時に演出できます。背景のカラーブロブを動かすと更に綺麗ですよ🪟",
  },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isTyping]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    const userMsg: Message = { id: Date.now(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // ダミーAI応答（実際の API 呼び出しに置き換えてください）
    setTimeout(() => {
      const aiMsg: Message = {
        id: Date.now() + 1,
        role: "ai",
        content:
          "なるほど、了解しました！もう少し詳しく教えていただけますか？😊",
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 1100);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.chatWindow} aria-label="AI Chat">
        {/* ヘッダー */}
        <header className={styles.header}>
          <div className={styles.avatar} aria-hidden>AI</div>
          <div className={styles.titleWrap}>
            <span className={styles.title}>Aurora Assistant</span>
            <span className={styles.status}>
              <span className={styles.dot} /> Online · GPT-Glass
            </span>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.iconBtn} aria-label="設定">⚙️</button>
            <button className={styles.iconBtn} aria-label="新規チャット">＋</button>
          </div>
        </header>

        {/* メッセージ */}
        <div className={styles.messages} ref={listRef}>
          {messages.map((m) => (
            <div
              key={m.id}
              className={`${styles.row} ${
                m.role === "user" ? styles.rowUser : styles.rowAi
              }`}
            >
              <div
                className={`${styles.smallAvatar} ${
                  m.role === "user" ? styles.user : styles.ai
                }`}
                aria-hidden
              >
                {m.role === "user" ? "U" : "AI"}
              </div>
              <div
                className={`${styles.bubble} ${
                  m.role === "user" ? styles.bubbleUser : styles.bubbleAi
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className={`${styles.row} ${styles.rowAi}`}>
              <div className={`${styles.smallAvatar} ${styles.ai}`} aria-hidden>
                AI
              </div>
              <div className={`${styles.bubble} ${styles.bubbleAi}`}>
                <span className={styles.typing}>
                  <span /><span /><span />
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 入力 */}
        <footer className={styles.composer}>
          <div className={styles.inputRow}>
            <input
              className={styles.input}
              type="text"
              placeholder="メッセージを入力してください..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="メッセージ"
            />
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={!input.trim()}
              aria-label="送信"
              title="送信"
            >
              {/* paper-plane SVG */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.2"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
              </svg>
            </button>
          </div>
          <p className={styles.hint}>Enter で送信 · Shift + Enter で改行</p>
        </footer>
      </section>
    </main>
  );
}
