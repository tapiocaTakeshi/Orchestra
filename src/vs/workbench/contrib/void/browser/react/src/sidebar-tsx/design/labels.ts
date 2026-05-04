/*---------------------------------------------------------------------------------------------
 *  SidebarChat 日本語ラベル定義
 *  writer §10「文言変更ルール」のテーブルをそのままオブジェクト化。
 *  ボタン/ツールチップ/ステート表示で必ずこのマップを参照し、英日混在を防ぐ。
 *--------------------------------------------------------------------------------------------*/

export const labels = {
	// 汎用操作
	send: '送信',
	cancel: 'キャンセル',
	copy: 'コピー',
	approve: '承認',
	reject: '拒否',
	retry: 'やり直す',
	openSettings: '設定を開く',
	login: 'ログイン',

	// 添付 / ファイル
	attachImage: '画像を添付',
	currentFile: '現在のファイル',
	scrollToBottom: '一番下へスクロール',
	dropHere: 'ここにファイルをドロップ',

	// Thread / Checkpoint
	checkpoint: 'チェックポイント',
	disabledWhileRunning: '実行中は無効です',
	disabledAnotherThread: '他のスレッド実行中のため無効です',

	// 状態
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

	// Tool / Results
	resultsTruncated: '結果は省略されています',
	noLintErrors: 'lint エラーはありません',
	noOutput: '出力はありません',

	// Command bar
	noChangedFiles: '変更されたファイルはありません',
	nChangedFiles: (n: number) => `${n} 件の変更されたファイル`,
	rejectAll: 'すべて拒否',
	acceptAll: 'すべて承認',
	rejectFile: 'ファイルを拒否',
	acceptFile: 'ファイルを承認',

	// Orchestration
	taskGenerationFlow: 'タスク生成フロー',
	taskExecutionFlow: (n: number) => `タスク実行フロー ${n}`,
	toggleContextInput: 'コンテキスト入力を表示/非表示',

	// Review
	docReview: 'ドキュメントレビュー',
	approveAndContinue: '承認して次へ進む',

	// Reasoning
	reasoningInProgress: '思考中',
	reasoningDone: (sec: number) => `${sec.toFixed(1)} 秒間思考しました`,
	reasoningFallback: '思考',
} as const;

export type Labels = typeof labels;
export default labels;
