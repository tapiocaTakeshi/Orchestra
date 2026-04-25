/**
 * SidebarChat の状態・メッセージ・エラー分類に関する型定義。
 * ideaman P0「状態ラベルの標準化」に対応する単一ソース。
 */

export type ChatStatus =
  | 'idle'
  | 'sending'
  | 'generating'
  | 'success'
  | 'error';

export type MessageStatus = 'pending' | 'delivered' | 'failed';

export type ErrorCategory =
  | 'network'
  | 'timeout'
  | 'auth'
  | 'validation'
  | 'server'
  | 'tool'
  | 'unknown';

export interface ChatError {
  category: ErrorCategory;
  /** ユーザー向けの短い文言（次アクション中心） */
  userMessage: string;
  /** 開発者向け詳細（折りたたみ表示に使用） */
  detail?: string;
  /** 問い合わせ用に画面に表示する ID */
  requestId?: string;
  /** 再送可能かどうか */
  retryable: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: MessageStatus;
  error?: ChatError;
  createdAt: number;
}

export interface Suggestion {
  id: string;
  label: string;
  icon?: 'search' | 'file';
  /** クリック時に入力欄へ差し込むテキスト（省略時は label を使用） */
  insertText?: string;
}

/** ideaman「送信エリアのステータス文言辞書」 */
export const STATUS_LABELS: Record<ChatStatus, string> = {
  idle: '送信',
  sending: '送信中…',
  generating: '応答を生成中…',
  success: '完了',
  error: '失敗',
};

/** エラーカテゴリ別のユーザー向けデフォルト文言 */
export const ERROR_MESSAGES: Record<ErrorCategory, string> = {
  network: '通信に失敗しました。再送できます。',
  timeout: '通信が途切れました。再送できます。',
  auth: 'ログインが必要です。サインインし直してください。',
  validation: '入力を確認してください。',
  server: '一時的な問題です。時間をおいて再試行してください。',
  tool: 'ツール実行に失敗しました。対象パスや権限を確認してください。',
  unknown: '不明なエラーが発生しました。再試行してください。',
};
