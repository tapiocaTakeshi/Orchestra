// =============================================================================
// SidebarChat UI Strings (ja)
// -----------------------------------------------------------------------------
// writer の「§10 文言変更ルール」を grep しやすい形で集約した辞書。
// SidebarChat.tsx 内の英語ハードコードをこの定数参照に置換していく。
// =============================================================================

export const chatStrings = {
	// --- 送信・操作 ---------------------------------------------------------
	send: '送信',
	stop: '停止',
	cancel: 'キャンセル',
	copy: 'コピー',
	approve: '承認',
	reject: '拒否',
	approveAll: 'すべて承認',
	rejectAll: 'すべて拒否',
	approveFile: 'ファイルを承認',
	rejectFile: 'ファイルを拒否',
	openSettings: '設定を開く',
	login: 'ログイン',

	// --- 添付 ---------------------------------------------------------------
	attachImage: '画像を添付',
	dropHere: 'ここにファイルをドロップ',

	// --- ナビゲーション -----------------------------------------------------
	scrollToBottom: '一番下へスクロール',
	currentFile: '現在のファイル',
	checkpoint: 'チェックポイント',

	// --- ステータス ---------------------------------------------------------
	generating: '生成中',
	thinking: '思考中',
	searching: '検索中',
	reading: '読み込み',
	coding: '実装中',
	running: '実行中',
	awaiting: '承認待ち',
	done: '完了',
	rejected: '却下',
	error: 'エラー',

	// --- 無効時の理由 -------------------------------------------------------
	disabledWhileRunning: '実行中は無効です',
	disabledWhileOtherThread: '他のスレッド実行中のため無効です',

	// --- Tool 結果 ----------------------------------------------------------
	resultsTruncated: '結果は省略されています',
	noLintErrors: 'lint エラーはありません',
	noOutput: '出力はありません',

	// --- CommandBarInChat --------------------------------------------------
	noChangedFiles: '変更されたファイルはありません',
	changedFilesCount: (n: number) => `${n}件の変更されたファイル`,

	// --- Flow Review -------------------------------------------------------
	docReview: 'ドキュメントレビュー',
	reviewPending: 'レビュー待ち',
	reviewApproved: '承認済み',
	reviewRejected: '却下',
	primaryApproveNext: '承認して次へ進む',
	secondaryRedo: 'やり直す',

	// --- Division Orchestration -------------------------------------------
	taskGenerationFlow: 'タスク生成フロー',
	taskExecutionFlow: 'タスク実行フロー',
	toggleContextInput: 'コンテキスト入力を表示/非表示',

	// --- Reasoning ----------------------------------------------------------
	thought: '思考',
	thoughtForSeconds: (sec: string) => `${sec} 秒間思考しました`,
} as const;

export type ChatStrings = typeof chatStrings;
