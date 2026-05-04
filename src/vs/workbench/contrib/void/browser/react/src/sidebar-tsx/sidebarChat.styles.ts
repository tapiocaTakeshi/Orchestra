/*---------------------------------------------------------------------------------------------
 *  SidebarChat className ユーティリティ
 *
 *  - 既存 Tailwind 記述を壊さず、段階的に差し替えられるように関数として提供
 *  - writer の仕様 (section 7) に 1:1 対応させる
 *--------------------------------------------------------------------------------------------*/

import { getAccentForTool, type ToolState } from './design/designTokens.js'

/** class の安全連結。falsy は除去する */
const cx = (...xs: Array<string | false | null | undefined>) =>
	xs.filter(Boolean).join(' ')

/* -------------------------------------------------------------------------- */
/* Input area (VoidChatArea)                                                   */
/* -------------------------------------------------------------------------- */

export const chatInputWrapperClass = (opts: {
	isDragOver?: boolean
	isFocused?: boolean
	isDisabled?: boolean
}) => cx(
	'relative flex flex-col',
	'bg-void-bg-1',
	'rounded-md',
	'border',
	// drag > focus > default の優先順
	opts.isDragOver
		? 'border-blue-400 bg-blue-500/10'
		: opts.isFocused
			? 'border-void-border-1'
			: 'border-void-border-3',
	opts.isDisabled && 'opacity-60 pointer-events-none',
	'transition-colors duration-150',
	'p-2 max-h-[80vh]',
)

/** 入力欄下部のツールバー。旧 bg-black/80 を token ベースに置換 */
export const chatInputToolbarClass = () => cx(
	'flex items-center justify-between',
	'px-2 py-1 mt-1',
	'bg-void-bg-2 border border-void-border-1',
	'rounded-md',
)

/* -------------------------------------------------------------------------- */
/* Message bubbles                                                             */
/* -------------------------------------------------------------------------- */

export const userBubbleClass = () => cx(
	'self-end max-w-[85%]',
	'px-3 py-2',
	'rounded-xl',
	'border border-void-border-1',
	'bg-void-bg-1',
	'shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
	'transition-colors duration-150',
)

export const assistantCardClass = () => cx(
	'relative',
	'px-3.5 py-3',
	'rounded-lg',
	'bg-void-bg-2',
	'border border-void-border-1',
	// 左アクセント: 3px focusBorder
	'border-l-[3px]',
	'[border-left-color:var(--vscode-focusBorder)]',
	'shadow-[0_1px_4px_rgba(0,0,0,0.06)]',
)

/* -------------------------------------------------------------------------- */
/* Tool card (ToolHeaderWrapper)                                               */
/* -------------------------------------------------------------------------- */

export const toolCardClass = (state: ToolState) => {
	const accent = getAccentForTool(state)
	return {
		className: cx(
			'rounded-md border border-void-border-1 bg-void-bg-2',
			'border-l-2',
			'transition-colors duration-200',
			state === 'rejected' && 'opacity-80',
		),
		style: { borderLeftColor: accent },
	}
}

export const toolHeaderRowClass = () => cx(
	'flex items-center justify-between',
	'min-h-[28px] px-2.5 py-1',
	'gap-2',
	'text-[12px]',
)

export const toolBodyClass = () => cx(
	'bg-void-bg-3',
	'px-3 py-2',
	'text-[12px] leading-snug',
	'border-t border-void-border-2',
)

/* -------------------------------------------------------------------------- */
/* FlowReview                                                                  */
/* -------------------------------------------------------------------------- */

export type ReviewState = 'pending' | 'approved' | 'rejected'

export const flowReviewContainerClass = (state: ReviewState) => cx(
	'rounded-lg border p-3 bg-void-bg-1',
	state === 'pending' && 'border-[color:var(--vscode-focusBorder)]',
	state === 'approved' && 'border-green-500/40 bg-green-500/5',
	state === 'rejected' && 'border-red-500/40 bg-red-500/5 opacity-90',
)

/* -------------------------------------------------------------------------- */
/* Command bar in chat                                                         */
/* -------------------------------------------------------------------------- */

export const commandBarPanelClass = () => cx(
	'bg-void-bg-3',
	'border-t border-l border-r border-void-border-2',
	'rounded-t-md',
	'px-3 py-2 text-[12px]',
)

/* -------------------------------------------------------------------------- */
/* Shared atoms                                                                */
/* -------------------------------------------------------------------------- */

export const iconButtonClass = (opts: { active?: boolean } = {}) => cx(
	'inline-flex items-center justify-center',
	'min-w-[24px] min-h-[24px]', // WCAG target size 24px 以上
	'rounded-sm',
	'text-void-fg-3 hover:text-void-fg-1',
	'hover:bg-void-bg-2',
	'focus-visible:outline focus-visible:outline-1 focus-visible:outline-[color:var(--vscode-focusBorder)]',
	'transition-colors duration-150',
	opts.active && 'text-void-fg-1 bg-void-bg-2',
)

export const pillBadgeClass = () => cx(
	'inline-flex items-center',
	'h-[18px] px-1.5',
	'rounded-sm',
	'bg-void-bg-3 text-void-fg-3',
	'text-[10px] font-medium',
)

export { cx }
