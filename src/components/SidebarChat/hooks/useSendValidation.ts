import { useMemo } from 'react';
import type { SendBlockReason } from '../types';

export interface ValidationInput {
  text: string;
  maxLength?: number;
  isSending: boolean;
  isIndexing?: boolean;
  networkError?: string | null;
}

export interface ValidationResult {
  canSend: boolean;
  reason: SendBlockReason | null;
  charCount: number;
  remaining: number | null;
}

/**
 * H1 (案4) — 送信可否を「理由つき」で返す。
 * UI 側は canSend=false のとき reason を必ずインライン表示する。
 */
export function useSendValidation(input: ValidationInput): ValidationResult {
  const { text, maxLength = 8000, isSending, isIndexing, networkError } = input;

  return useMemo<ValidationResult>(() => {
    const trimmed = text.trim();
    const charCount = text.length;
    const remaining = maxLength - charCount;

    let reason: SendBlockReason | null = null;
    if (isSending) reason = { kind: 'in-flight' };
    else if (isIndexing) reason = { kind: 'indexing' };
    else if (networkError) reason = { kind: 'network-error', message: networkError };
    else if (trimmed.length === 0) reason = { kind: 'empty' };
    else if (charCount > maxLength)
      reason = { kind: 'too-long', max: maxLength, current: charCount };

    return {
      canSend: reason === null,
      reason,
      charCount,
      remaining,
    };
  }, [text, maxLength, isSending, isIndexing, networkError]);
}
