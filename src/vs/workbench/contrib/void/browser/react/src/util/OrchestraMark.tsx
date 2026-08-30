/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useId } from 'react'

// Orchestra's brand mark in motion: two strands weaving around a centre line
// before opening into a pair of arrows, the weave drifting left to right.
//
// The boot splash plays the same animation across the whole window (see
// `src/vs/code/electron-sandbox/workbench/workbench.ts`). That mark cannot just
// be scaled down for chat - at the ~16px a loading indicator gets, five crossings
// on a thin stroke collapse into an unreadable smudge. So this is the same motion
// law (the phase advance, the 3.6s cycle, the easing) redrawn at three crossings
// on a heavier stroke, which still reads inline next to text.
//
// The splash has to spell its keyframes out by hand because it runs before the
// module loader; here the phases are just evaluated from the curve.

const VIEW_W = 76
const VIEW_H = 42
const CY = 21

const X0 = 3          // both strands emanate from a point on the centre line
const X_OPEN = 42     // where the weave starts swinging out into the fork
const X_END = 60      // where the strands hand off to the arrowheads
const PERIOD = 28
const AMP = 5.6
const RAMP = 20       // amplitude eases in over roughly one period, so the tail tapers
const OPEN_BASE = 11.5
const OPEN_WOBBLE = 1.8
const SEGMENTS = 16
const FRAMES = 8

const DURATION = '3.6s'
const EASING = 'cubic-bezier(0.45, 0, 0.55, 1)'

const ARROW_POINTS = '0,-6 14,0 0,6 4.5,0'

const smoothstep = (t: number) => t * t * (3 - 2 * t)

// One strand at a given phase. `side` is -1 for the strand that starts upward.
const strandY = (x: number, phase: number, side: number): number => {
	const amp = AMP * Math.min(1, Math.max(0, (x - X0) / RAMP))
	const weave = CY + side * amp * Math.sin((2 * Math.PI * (x - X0)) / PERIOD + phase)

	if (x <= X_OPEN) { return weave }

	// Past the opening the weave blends out into the fork. The spread breathes with
	// the phase so the arrowheads travel, the way they do on the splash.
	const t = smoothstep((x - X_OPEN) / (X_END - X_OPEN))
	const spread = OPEN_BASE + OPEN_WOBBLE * Math.cos(phase)
	return weave * (1 - t) + (CY + side * spread) * t
}

// Catmull-Rom through the sampled points, converted to cubic beziers.
const pathFor = (phase: number, side: number): string => {
	const pts: [number, number][] = []
	for (let i = 0; i <= SEGMENTS; i++) {
		const x = X0 + ((X_END - X0) * i) / SEGMENTS
		pts.push([x, strandY(x, phase, side)])
	}

	const at = (i: number) => pts[Math.min(pts.length - 1, Math.max(0, i))]
	const n = (v: number) => Number(v.toFixed(2))

	let d = `M${n(pts[0][0])},${n(pts[0][1])}`
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
		const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
		const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
		d += ` C${n(c1[0])},${n(c1[1])} ${n(c2[0])},${n(c2[1])} ${n(p2[0])},${n(p2[1])}`
	}
	return d
}

// The arrowhead sits at the strand's end, turned to match its tangent there.
const headTransform = (phase: number, side: number): string => {
	const y = strandY(X_END, phase, side)
	const angle = (Math.atan2(y - strandY(X_END - 0.5, phase, side), 0.5) * 180) / Math.PI
	return `translate(${X_END}px, ${Number(y.toFixed(2))}px) rotate(${Number(angle.toFixed(1))}deg)`
}

const phaseAt = (frame: number) => (2 * Math.PI * frame) / FRAMES

const keyframesFor = (name: string, at: (phase: number) => string): string => {
	const rows: string[] = []
	for (let f = 0; f <= FRAMES; f++) {
		rows.push(`\t${(100 * f) / FRAMES}% { ${at(phaseAt(f))} }`)
	}
	return `@keyframes ${name} {\n${rows.join('\n')}\n}`
}

// Hooked up by data attribute rather than class name on purpose. The React tree is
// run through scope-tailwind, which rewrites every `className` in the source (adding
// the `void-` prefix) but leaves CSS built here in TS alone - so class-based
// selectors would quietly stop matching and the mark would sit still. Data
// attributes pass through that rewrite untouched.
const buildCss = (): string => [
	`[data-orchestra-mark] { display: inline-block; vertical-align: middle; overflow: visible; flex: none; }`,
	`[data-orchestra-mark] [data-om^="strand"] { fill: none; stroke-width: 5; stroke-linecap: round; }`,
	`[data-orchestra-mark] [data-om^="head"] { fill: #e02431; stroke: none; transform-box: view-box; transform-origin: 0 0; }`,
	`[data-orchestra-mark] [data-om="strand-a"] { animation: orchestra-mark-wave-a ${DURATION} ${EASING} infinite; }`,
	`[data-orchestra-mark] [data-om="strand-b"] { animation: orchestra-mark-wave-b ${DURATION} ${EASING} infinite; }`,
	`[data-orchestra-mark] [data-om="head-a"] { animation: orchestra-mark-head-a ${DURATION} ${EASING} infinite; }`,
	`[data-orchestra-mark] [data-om="head-b"] { animation: orchestra-mark-head-b ${DURATION} ${EASING} infinite; }`,
	keyframesFor('orchestra-mark-wave-a', p => `d: path("${pathFor(p, -1)}");`),
	keyframesFor('orchestra-mark-wave-b', p => `d: path("${pathFor(p, 1)}");`),
	keyframesFor('orchestra-mark-head-a', p => `transform: ${headTransform(p, -1)};`),
	keyframesFor('orchestra-mark-head-b', p => `transform: ${headTransform(p, 1)};`),
	// Falls back to the mark held at its first phase, which the `d` attributes and the
	// inline transforms on the arrowheads already put on screen.
	`@media (prefers-reduced-motion: reduce) {
	[data-orchestra-mark] [data-om] { animation: none; }
}`
].join('\n')

const MARK_STYLE_ID = 'orchestra-brand-mark-keyframes'

if (typeof document !== 'undefined' && !document.getElementById(MARK_STYLE_ID)) {
	const style = document.createElement('style')
	style.id = MARK_STYLE_ID
	style.textContent = buildCss()
	document.head.appendChild(style)
}

export const ORCHESTRA_MARK_ASPECT = VIEW_W / VIEW_H

// `height` is in px; the mark keeps its aspect ratio. 16 is the size tuned for
// sitting inline next to chat text - much below 14 the crossings stop reading.
export const OrchestraMark = ({ height = 16, className = '' }: { height?: number, className?: string }) => {
	// A gradient id per instance: sharing one would break every other mark on the
	// page the moment the instance that owned the <defs> unmounted.
	const fadeId = `orchestra-mark-fade-${useId().replace(/:/g, '')}`

	return (
		<svg
			data-orchestra-mark=''
			className={className}
			viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
			height={height}
			width={Math.round(height * ORCHESTRA_MARK_ASPECT)}
			aria-hidden='true'
		>
			<defs>
				<linearGradient id={fadeId} x1={X0} y1='0' x2={X_END} y2='0' gradientUnits='userSpaceOnUse'>
					<stop offset='0' stopColor='#e02431' stopOpacity='0' />
					<stop offset='0.3' stopColor='#b81c2c' stopOpacity='0.95' />
					<stop offset='0.58' stopColor='#f0455a' stopOpacity='1' />
					<stop offset='1' stopColor='#e02431' stopOpacity='1' />
				</linearGradient>
			</defs>
			<path data-om='strand-a' d={pathFor(phaseAt(0), -1)} stroke={`url(#${fadeId})`} />
			<path data-om='strand-b' d={pathFor(phaseAt(0), 1)} stroke={`url(#${fadeId})`} />
			<polygon data-om='head-a' points={ARROW_POINTS} style={{ transform: headTransform(phaseAt(0), -1) }} />
			<polygon data-om='head-b' points={ARROW_POINTS} style={{ transform: headTransform(phaseAt(0), 1) }} />
		</svg>
	)
}
