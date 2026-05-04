import { useMemo } from 'react';

export interface InputValidationResult {
  canSubmit: boolean;
  reason?: string;
  remaining: number;
  isOverLimit: boolean;
}

/**
 * ideaman P0「クライアント側バリデーション」実装。
 * - 空送信防止（trim 長 0）
 * - 上限長（デフォルト 4000 文字）
 * - 残り文字数の提示
 */
export function useInputValidation(
  text: string,
  maxLength = 4000,
): InputValidationResult {
  return useMemo(() => {
    const trimmed = text.trim();
    const remaining = maxLength - text.length;
    const isOverLimit = text.length > maxLength;

    if (trimmed.length === 0) {
      return {
        canSubmit: false,
        reason: 'メッセージを入力してください。',
        remaining,
        isOverLimit: false,
      };
    }
    if (isOverLimit) {
      return {
        canSubmit: false,
        reason: `${maxLength.toLocaleString()} 文字以内に収めてください。`,
        remaining,
        isOverLimit: true,
      };
    }
    return { canSubmit: true, remaining, isOverLimit: false };
  }, [text, maxLength]);
}
