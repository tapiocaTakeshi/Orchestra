import React, { useEffect, useRef } from 'react';
import type { AttachedContext } from './types';

interface Props {
  open: boolean;
  text: string;
  contexts: AttachedContext[];
  onConfirm: () => void;
  onEdit: () => void;
}

/**
 * H2 / 案6 — 送信前プレビュー。
 * - 入力の最終見た目（改行保持）と添付コンテキスト一覧を表示
 * - 「修正する」で入力へ戻し（入力内容は保持）、「送信する」でのみ履歴追加
 * - Escape で onEdit、Enter（Ctrl/Cmd+Enter）で onConfirm
 */
export const SendPreviewModal: React.FC<Props> = ({
  open,
  text,
  contexts,
  onConfirm,
  onEdit,
}) => {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEdit();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onConfirm, onEdit]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-preview-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onEdit}
    >
      <div
        className="w-[min(640px,90vw)] max-h-[80vh] flex flex-col rounded-lg border shadow-2xl"
        style={{
          backgroundColor: 'var(--void-bg-2)',
          borderColor: 'var(--void-border)',
          color: 'var(--void-fg-1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="px-4 py-3 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--void-border)' }}
        >
          <h2 id="send-preview-title" className="m-0 text-sm font-semibold">
            送信前プレビュー
          </h2>
          <span className="text-[11px]" style={{ color: 'var(--void-fg-3)' }}>
            Esc: 修正に戻る ／ Ctrl+Enter: 送信
          </span>
        </header>

        <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
          {contexts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {contexts.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border"
                  style={{
                    backgroundColor: 'var(--void-bg-3)',
                    borderColor: 'var(--void-border)',
                    color: 'var(--void-fg-1)',
                  }}
                  title={c.detail}
                >
                  {c.label}
                </span>
              ))}
            </div>
          )}

          <div
            className="p-3 rounded-md text-sm whitespace-pre-wrap break-words border"
            style={{
              backgroundColor: 'var(--void-bg-main)',
              borderColor: 'var(--void-border)',
              color: 'var(--void-fg-1)',
              lineHeight: 1.6,
              minHeight: 80,
            }}
          >
            {text}
          </div>
        </div>

        <footer
          className="px-4 py-3 border-t flex items-center justify-end gap-2"
          style={{ borderColor: 'var(--void-border)' }}
        >
          <button
            type="button"
            onClick={onEdit}
            className="px-3 py-1.5 text-xs rounded-md border cursor-pointer"
            style={{
              backgroundColor: 'transparent',
              borderColor: 'var(--void-border)',
              color: 'var(--void-fg-1)',
            }}
          >
            修正する
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs rounded-md border-0 cursor-pointer font-semibold"
            style={{
              backgroundColor: 'var(--void-accent)',
              color: '#fff',
            }}
          >
            送信する
          </button>
        </footer>
      </div>
    </div>
  );
};
