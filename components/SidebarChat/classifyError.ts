import { ChatError, ERROR_MESSAGES, ErrorCategory } from './types';

/**
 * searcher の指摘「エラーの内訳を分類して表示」に対応。
 * 任意の例外を ChatError に正規化する。
 */
export function classifyError(err: unknown, requestId?: string): ChatError {
  // AbortError (timeout / user cancel)
  if (err instanceof DOMException && err.name === 'AbortError') {
    return build('timeout', err.message, requestId, true);
  }

  // fetch Response 由来（{ status, statusText }）
  if (isResponseLike(err)) {
    const status = err.status;
    const category: ErrorCategory =
      status === 401 || status === 403
        ? 'auth'
        : status === 408 || status === 504
        ? 'timeout'
        : status >= 500
        ? 'server'
        : status === 400 || status === 422
        ? 'validation'
        : 'unknown';
    return build(category, `HTTP ${status} ${err.statusText ?? ''}`.trim(), requestId, category !== 'auth' && category !== 'validation');
  }

  // ネットワーク不通（TypeError: Failed to fetch）
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return build('network', err.message, requestId, true);
  }

  if (err instanceof Error) {
    return build('unknown', `${err.name}: ${err.message}`, requestId, true);
  }

  return build('unknown', String(err), requestId, true);
}

function build(
  category: ErrorCategory,
  detail: string,
  requestId: string | undefined,
  retryable: boolean,
): ChatError {
  return {
    category,
    userMessage: ERROR_MESSAGES[category],
    detail,
    requestId,
    retryable,
  };
}

function isResponseLike(x: unknown): x is { status: number; statusText?: string } {
  return (
    typeof x === 'object' &&
    x !== null &&
    'status' in x &&
    typeof (x as { status: unknown }).status === 'number'
  );
}
