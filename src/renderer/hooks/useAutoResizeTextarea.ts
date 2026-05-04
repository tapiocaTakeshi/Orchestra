import { useEffect, RefObject } from 'react';

/**
 * textarea を内容に合わせて自動的にリサイズするフック。
 * @param ref     対象 textarea の ref
 * @param value   現在の入力値（変化を監視）
 * @param maxPx   最大高さ (px)。超えたらスクロール
 */
export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxPx = 160,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, maxPx);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden';
  }, [ref, value, maxPx]);
}
