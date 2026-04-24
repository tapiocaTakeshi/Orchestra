/**
 * SidebarChat デザインシステム エントリポイント。
 * 既存の SidebarChat.tsx から最小差分でインポートして使えるように集約する。
 *
 * 使用例:
 *   import { ChatCard, ChatCardHeader, StatusBadge, tokens, labels } from './designSystem';
 *   import './sidebar-chat.polish.css';
 *
 * 移行方針:
 *   1. `bg-black/80` など黒ベタクラスを見つけたら `sc-input-bar` に置換する
 *   2. ツールカードのコンテナを `ChatCard variant="tool" status={...}` に置換する
 *   3. 状態表示（Error / Running / Rejected）を `StatusBadge` に置換する
 *   4. 英語ラベルを `labels.*` 参照に置換する
 *
 * このファイルは .tsx — .tsx を再エクスポートするため外側 tsc（--jsx 無効）の対象外にする必要がある。
 */

export { ChatCard, ChatCardHeader } from './ChatCard.js';
export { StatusBadge } from './StatusBadge.js';
export type { StatusKind } from './StatusBadge.js';

export * as tokens from './designTokens.js';
export {
	surfaces,
	textColors,
	borderColors,
	semantic,
	radius,
	motion,
	cardStyles,
	statusAccent,
	labels,
} from './designTokens.js';
