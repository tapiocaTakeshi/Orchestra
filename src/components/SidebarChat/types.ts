// Phase 1 改善で共用する型。既存 SidebarChat.tsx からも参照できるよう切り出し。

export type ToolStatus = 'running' | 'success' | 'error';

export interface ToolCallData {
  id: string;
  name: string;
  /** 折りたたみラベルに出す short summary（M7 対応） */
  summary?: string;
  status: ToolStatus;
  /** 本文（JSON/テキスト/コード）。長文の場合は折りたたみ既定 */
  body: string;
  /** 文字数しきい値を超えたら default collapsed（H3 / 案13） */
  forceCollapsedByDefault?: boolean;
}

export interface AttachedContext {
  id: string;
  kind: 'file' | 'range' | 'selection';
  label: string;
  detail?: string;
}

export type SendBlockReason =
  | { kind: 'empty' }
  | { kind: 'too-long'; max: number; current: number }
  | { kind: 'in-flight' }
  | { kind: 'indexing' }
  | { kind: 'network-error'; message: string }
  | { kind: 'custom'; message: string };

/** researcher の「次に何をすれば送れるか」を必ず含める原則 (H1) */
export function describeBlockReason(r: SendBlockReason): string {
  switch (r.kind) {
    case 'empty':
      return 'メッセージを入力してください。';
    case 'too-long':
      return `最大 ${r.max} 文字までです（現在 ${r.current} 文字）。短く分割してください。`;
    case 'in-flight':
      return '送信中です。完了後にもう一度お試しください。';
    case 'indexing':
      return 'プロジェクトのインデックス作成中です。完了するまで送信を一時停止しています。';
    case 'network-error':
      return `接続エラー: ${r.message}。再試行ボタンから送り直せます。`;
    case 'custom':
      return r.message;
  }
}
