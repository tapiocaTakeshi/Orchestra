"use client";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`flex items-end gap-3 ${
        isUser ? "flex-row-reverse" : "flex-row"
      }`}
    >
      {/* アバター */}
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-xs font-bold shadow-lg ${
          isUser
            ? "bg-gradient-to-br from-pink-400/80 to-rose-500/80"
            : "bg-gradient-to-br from-indigo-400/80 to-fuchsia-500/80"
        }`}
      >
        {isUser ? "You" : "AI"}
      </div>

      {/* バブル */}
      <div className={`flex max-w-[78%] flex-col ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={[
            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
            "backdrop-blur-xl border shadow-lg",
            isUser
              ? "rounded-br-sm bg-gradient-to-br from-pink-400/30 to-fuchsia-500/30 border-white/25 text-white"
              : "rounded-bl-sm bg-white/10 border-white/15 text-white/95",
          ].join(" ")}
        >
          {message.content}
        </div>
        <span className="mt-1 px-1 text-[10px] text-white/50">{time}</span>
      </div>
    </div>
  );
}
