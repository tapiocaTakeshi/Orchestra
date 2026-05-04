/*---------------------------------------------------------------------------------------------
 *  SidebarChat 文言辞書
 *
 *  writer エージェントが整理した「英日混在の解消」ルールを 1 箇所に集約。
 *  既存 SidebarChat.tsx から literal を置換することで段階的に日本語統一できる。
 *--------------------------------------------------------------------------------------------*/

export const chatStrings = {
	// ボタン
	send: '送信',
	stop: '停止',
	approve: '承認',
	reject: '拒否',
	approveAll: 'すべて承認',
	rejectAll: 'すべて拒否',
	approveFile: 'ファイルを承認',
	rejectFile: 'ファイルを拒否',
	cancel: 'キャンセル',
	copy: 'コピー',
	openSettings: '設定を開く',
	login: 'ログイン',
	retry: 'やり直す',
	approveAndNext: '承認して次へ進む',

	// 添付 / スクロール
	attachImage: '画像を添付',
	scrollToBottom: '一番下へスクロール',
	dropFilesHere: 'ここにファイルをドロップ',

	// 状態
	running: '実行中',
	generating: '生成中',
	thinking: '思考中',
	searching: '検索中',
	reading: '読み込み',
	coding: '実装中',
	executing: '実行中',
	done: '完了',
	pending: '承認待ち',
	rejected: '却下',
	error: 'エラー',

	// 説明
	resultsTruncated: '結果は省略されています',
	noLintErrors: 'lint エラーはありません',
	noOutput: '出力はありません',
	disabledWhileRunning: '実行中は無効です',
	disabledOtherThread: '他のスレッド実行中のため無効です',
	noChangedFiles: '変更されたファイルはありません',
	nChangedFiles: (n: number) => `${n}件の変更されたファイル`,

	// セクション見出し
	taskGenerationFlow: 'タスク生成フロー',
	taskExecutionFlow: 'タスク実行フロー',
	toggleContextInput: 'コンテキスト入力を表示/非表示',
	documentReview: 'ドキュメントレビュー',
	reviewPending: 'レビュー待ち',
	reviewApproved: '承認済み',
	reviewRejected: '却下',

	// reasoning
	thinkingNow: '思考中',
	thoughtForSeconds: (sec: number) => `${sec.toFixed(1)} 秒間思考しました`,
	thoughtFallback: '思考',

	// 現在ファイル / checkpoint
	currentFile: '現在のファイル',
	checkpoint: 'チェックポイント',
} as const

export type ChatStringKey = keyof typeof chatStrings
