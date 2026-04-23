// SidebarChat 表示文言 (日本語統一)
// writer 仕様書 セクション10 準拠。英日混在を避け、ここから import する。

export const sidebarChatStrings = {
	// ------ 汎用アクション ------
	send: '送信',
	cancel: 'キャンセル',
	copy: 'コピー',
	approve: '承認',
	reject: '拒否',
	retry: 'やり直す',
	openSettings: '設定を開く',
	login: 'ログイン',

	// ------ 入力エリア ------
	attachImage: '画像を添付',
	attachFile: 'ファイルを添付',
	dropHere: 'ここにファイルをドロップ',
	scrollToBottom: '一番下へスクロール',
	disabledWhileRunning: '実行中は無効です',
	disabledOtherThreadRunning: '他のスレッド実行中のため無効です',

	// ------ 状態ラベル ------
	generating: '生成中',
	thinking: '思考中',
	searching: '検索中',
	reading: '読み込み',
	coding: '実装中',
	running: '実行中',
	awaitingApproval: '承認待ち',
	approved: '承認済み',
	rejected: '却下',
	completed: '完了',
	error: 'エラー',

	// ------ ツール結果 ------
	noOutput: '出力はありません',
	resultsTruncated: '結果は省略されています',
	noLintErrors: 'lint エラーはありません',

	// ------ 会話構造 ------
	currentFile: '現在のファイル',
	checkpoint: 'チェックポイント',
	documentReview: 'ドキュメントレビュー',
	approveAndContinue: '承認して次へ進む',

	// ------ Orchestration ------
	taskGenerationFlow: 'タスク生成フロー',
	taskExecutionFlow: 'タスク実行フロー',
	toggleContextInput: 'コンテキスト入力を表示/非表示',

	// ------ CommandBar ------
	noChangedFiles: '変更されたファイルはありません',
	changedFilesCount: (n: number) => `${n}件の変更されたファイル`,
	rejectAll: 'すべて拒否',
	acceptAll: 'すべて承認',
	rejectFile: 'ファイルを拒否',
	acceptFile: 'ファイルを承認',

	// ------ Reasoning ------
	thoughtForSeconds: (sec: number) => `${sec.toFixed(1)} 秒間思考しました`,
	thoughtGeneric: '思考',
} as const;

export type SidebarChatStrings = typeof sidebarChatStrings;
