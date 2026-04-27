"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
  time: string;
};

const initialMessages: Message[] = [
  {
    id: "m1",
    role: "ai",
    content:
      "こんにちは！私は AI アシスタントです✨ 何でも気軽に聞いてください。",
    time: "10:24",
  },
  {
    id: "m2",
    role: "user",
    content: "Glassmorphism のデザインって何が特徴なの？",
    time: "10:25",
  },
  {
    id: "m3",
    role: "ai",
    content:
      "半透明のすりガラス風背景・ぼかし(blur)・微細なボーダー・カラフルな背景との組み合わせが特徴です。奥行きと軽やかさを同時に演出できます。",
    time: "10:25",
  },
];

const nowHHMM = () =>
  new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

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

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      time: nowHHMM(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // 疑似 AI 応答
    setTimeout(() => {
      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: "ai",
        content:
          "なるほど！「" +
          text +
          "」について考えてみますね。実際の API 連携はここに差し込めます。",
        time: nowHHMM(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 900);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="glass-app-bg flex items-center justify-center p-4 sm:p-8">
      <div
        className="glass-panel relative z-10 w-full max-w-3xl flex flex-col"
        style={{ height: "min(88vh, 820px)" }}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/20">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-300 to-indigo-400 flex items-center justify-center text-white font-bold shadow-lg">
                AI
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-white/60 rounded-full" />
            </div>
            <div className="text-white">
              <div className="font-semibold leading-tight">Aurora Assistant</div>
              <div className="text-xs text-white/70">オンライン • Glass Mode</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="glass-btn px-3 py-1.5 rounded-full text-xs">新規</button>
            <button className="glass-btn px-3 py-1.5 rounded-full text-xs">設定</button>
          </div>
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="glass-scroll flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${
                m.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {m.role === "ai" && (
                <div className="w-8 h-8 mr-2 mt-1 shrink-0 rounded-full bg-gradient-to-br from-cyan-300 to-purple-400 flex items-center justify-center text-white text-xs font-bold shadow">
                  AI
                </div>
              )}
              <div
                className={`max-w-[78%] px-4 py-3 text-sm leading-relaxed shadow-lg ${
                  m.role === "user" ? "glass-bubble-user" : "glass-bubble-ai"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                <div
                  className={`mt-1 text-[10px] ${
                    m.role === "user" ? "text-white/80 text-right" : "text-white/60"
                  }`}
                >
                  {m.time}
                </div>
              </div>
              {m.role === "user" && (
                <div className="w-8 h-8 ml-2 mt-1 shrink-0 rounded-full bg-gradient-to-br from-amber-300 to-rose-400 flex items-center justify-center text-white text-xs font-bold shadow">
                  YOU
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="w-8 h-8 mr-2 mt-1 shrink-0 rounded-full bg-gradient-to-br from-cyan-300 to-purple-400 flex items-center justify-center text-white text-xs font-bold shadow">
                AI
              </div>
              <div className="glass-bubble-ai px-4 py-3 shadow-lg">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="px-4 sm:px-6 pb-5 pt-3 border-t border-white/15">
          <div className="glass-input flex items-end gap-2 rounded-2xl px-3 py-2">
            <button
              type="button"
              aria-label="添付"
              className="text-white/80 hover:text-white px-2 py-2"
              title="添付"
            >
              ＋
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="メッセージを入力..."
              className="flex-1 bg-transparent resize-none outline-none text-white placeholder-white/60 py-2 max-h-32"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim()}
              className="glass-btn px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              送信 ➤
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-white/60">
            Enter で送信 / Shift + Enter で改行
          </p>
        </div>
      </div>
    </div>
  );
}
