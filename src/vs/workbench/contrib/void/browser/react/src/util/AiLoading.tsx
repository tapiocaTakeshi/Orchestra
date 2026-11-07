/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// AI のローディング (返答の生成中・エージェントの作業中) に出す、赤い回転矢印のアニメーション。
// 元の GIF (16 コマ, 90ms/コマ) を背景を透過した 1 枚のスプライト (assets/ai-loading-sprite.png, 64px × 16 コマ) にし、
// CSS の steps() でコマ送りする。タイマーも再描画も無い。動きを減らす設定では 1 コマ目で止める。

import React from 'react';

const FRAMES = 16;
const FRAME_MS = 90;
const STYLE_ID = 'orchestra-ai-loading-style';

const spriteUrl = new URL('../assets/ai-loading-sprite.png', import.meta.url).href;

if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
	const style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = `
@keyframes orchestraAiLoading { to { background-position-x: calc(var(--orchestra-ai-size) * -${FRAMES}); } }
[data-orchestra-ai-loading] {
	display: inline-block;
	flex-shrink: 0;
	width: var(--orchestra-ai-size);
	height: var(--orchestra-ai-size);
	background-repeat: no-repeat;
	background-position: 0 0;
	background-size: calc(var(--orchestra-ai-size) * ${FRAMES}) var(--orchestra-ai-size);
	animation: orchestraAiLoading ${FRAMES * FRAME_MS}ms steps(${FRAMES}) infinite;
}
@media (prefers-reduced-motion: reduce) { [data-orchestra-ai-loading] { animation: none; } }
`;
	document.head.appendChild(style);
}

/** AI のローディング。size は px (正方形)。 */
export const AiLoading = ({ size = 14, className = '', label }: { size?: number, className?: string, label?: string }) => (
	<span
		data-orchestra-ai-loading=''
		className={className}
		role={label ? 'status' : undefined}
		aria-label={label}
		aria-hidden={label ? undefined : true}
		style={{ ['--orchestra-ai-size' as string]: `${size}px`, backgroundImage: `url("${spriteUrl}")`, verticalAlign: 'middle' } as React.CSSProperties}
	/>
);
