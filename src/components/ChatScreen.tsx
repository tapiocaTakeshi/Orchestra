"use client";

import { useState, useRef, useEffect } from "react";
import styles from "./ChatScreen.module.css";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "こんにちは！何でも聞いてください ✨",
      createdAt: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsSending(true);

    // ダミー応答（実プロジェクトでは fetch('/api/chat') 等に差し替え）
    setTimeout(() => {
      const reply: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `「${text}」について考えています…これはガラス風UIのデモ応答です。`,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, reply]);
      setIsSending(false);
    }, 700);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.page}>
      {/* 背景の装飾的なオーブ群 */}
      <div className={`${styles.orb} ${styles.orbA}`} aria-hidden />
      <div className={`${styles.orb} ${styles.orbB}`} aria-hidden />
      <div className={`${styles.orb} ${styles.orbC}`} aria-hidden />

      <main className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <div className={styles.logo}>✦</div>
            <div>
              <h1 className={styles.title}>Aurora Chat</h1>
              <p className={styles.subtitle}>Glassmorphism AI Assistant</p>
            </div>
          </div>
          <div className={styles.statusPill}>
            <span className={styles.dot} /> Online
          </div>
        </header>

        <div ref={listRef} className={styles.messages}>
          {messages.map((m) => (
            <div
              key={m.id}
              className={`${styles.row} ${
                m.role === "user" ? styles.rowUser : styles.rowAssistant
              }`}
            >
              {m.role === "assistant" && (
                <div className={`${styles.avatar} ${styles.avatarAi}`}>AI</div>
              )}
              <div
                className={`${styles.bubble} ${
                  m.role === "user" ? styles.bubbleUser : styles.bubbleAi
                }`}
              >
                {m.content}
              </div>
              {m.role === "user" && (
                <div className={`${styles.avatar} ${styles.avatarUser}`}>
                  You
                </div>
              )}
            </div>
          ))}
          {isSending && (
            <div className={`${styles.row} ${styles.rowAssistant}`}>
              <div className={`${styles.avatar} ${styles.avatarAi}`}>AI</div>
              <div className={`${styles.bubble} ${styles.bubbleAi}`}>
                <span className={styles.typing}>
                  <i /> <i /> <i />
                </span>
              </div>
            </div>
          )}
        </div>

        <form
          className={styles.composer}
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <textarea
            className={styles.input}
            placeholder="メッセージを入力..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            type="submit"
            className={styles.sendBtn}
            disabled={!input.trim() || isSending}
            aria-label="送信"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
              <path
                d="M3 11.5L21 3l-8.5 18-2.2-7.3L3 11.5z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </form>
      </main>
    </div>
  );
}
