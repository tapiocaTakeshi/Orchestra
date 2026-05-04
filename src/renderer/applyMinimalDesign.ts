/**
 * applyMinimalDesign
 * -----------------------------------------------------------
 * Electron レンダラー起動時に「Minimal」デザインレイヤーを
 * 適用するためのブートストラップ。
 *
 * - <html> に data-design="minimal" を付与
 * - src/styles/minimal-design.css を <head> に注入
 * - 二重適用を避けるため idempotent
 *
 * 使い方:
 *   既存のレンダラーエントリ（例: src/renderer/index.ts）の
 *   先頭で 1 行 import するだけで有効になる。
 *
 *     import './applyMinimalDesign';
 *
 *   もしくは関数として呼びたい場合:
 *
 *     import { applyMinimalDesign } from './applyMinimalDesign';
 *     applyMinimalDesign();
 */

const DESIGN_NAME = 'minimal';
const STYLE_ID = 'md-minimal-design-stylesheet';
// CSS の置き場所。Electron の bundler (webpack / vite / esbuild) で
// 静的アセットとして解決される前提の相対パス。
const STYLE_HREF = '../styles/minimal-design.css';

export function applyMinimalDesign(): void {
	if (typeof document === 'undefined') {
		// メインプロセスや non-DOM 環境では何もしない
		return;
	}

	const root = document.documentElement;
	if (root.getAttribute('data-design') !== DESIGN_NAME) {
		root.setAttribute('data-design', DESIGN_NAME);
	}

	if (!document.getElementById(STYLE_ID)) {
		const link = document.createElement('link');
		link.id = STYLE_ID;
		link.rel = 'stylesheet';
		link.href = STYLE_HREF;
		// 既存スタイルより後ろに入れて優先度を確保
		document.head.appendChild(link);
	}
}

// import するだけで適用されるようにする（副作用）
applyMinimalDesign();

export default applyMinimalDesign;
