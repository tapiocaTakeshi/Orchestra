"use client";

import { FormEvent, KeyboardEvent, useState } from "react";

export default function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={submit}
      className="border-t border-white/10 px-4 py-4 md:px-6"
    >
      <div className="glass-strong flex items-end gap-2 rounded-2xl px-3 py-2">
        <button
          type="button"
          aria-label="添付"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="メッセージを入力... (Shift+Enter で改行)"
          className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          aria-label="送信"
          className="group relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-fuchsia-500 text-white shadow-lg transition enabled:hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </svg>
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-white/40">
        AI は誤った情報を出力することがあります。重要な内容はご自身で確認してください。
      </p>
    </form>
  );
}
