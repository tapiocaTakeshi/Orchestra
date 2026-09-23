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
// law (the phase advance, the easing) redrawn at three crossings on a heavier
// stroke, which still reads inline next to text, cycling faster than the splash's
// 6s so a short wait still shows the weave move.
//
// Both sample their keyframes from the curve, and both open the same way: the
// strands draw out of the origin, the arrowheads launch once the strands reach
// them, and only then does the travelling highlight start - here compressed to
// under a second so it does not hold up a status that may only last a moment.

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
const FRAMES = 32     // enough phase samples per cycle that the weave glides rather than steps

const DURATION = '2.6s'
const EASING = 'linear'

// Entrance, played once per mount (duration + delay).
const INTRO_EASING = 'cubic-bezier(0.65, 0, 0.35, 1)'
const INTRO_DRAW = '0.6s'
const INTRO_LAUNCH = '0.5s 0.45s cubic-bezier(0.16, 1, 0.3, 1)'
const INTRO_LIGHT_DELAY = '0.7s'
const INTRO_LIGHT = `0.5s ${INTRO_LIGHT_DELAY}`

// Anchored at the notch, so the strand runs into the arrowhead instead of stopping short.
const ARROW_POINTS = '-3.5,-5 9.5,0 -3.5,5 0,0'
const ACCENT = '#d8283b'

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

// The weave is a double helix, as on the splash: each strand is in front for half
// of every period, swapping at the peaks, so each crossing has a clear over and
// under. These are the front-facing share of `side`'s strand across one period at
// phase 0; a mask slides them along with the weave (`z` is the strand's depth).
const depthStops = (side: number): { offset: number, opacity: number }[] => {
	const stops: { offset: number, opacity: number }[] = []
	for (let i = 0; i <= 24; i++) {
		const z = side * Math.cos((2 * Math.PI * i) / 24)
		stops.push({ offset: Number((i / 24).toFixed(3)), opacity: Number(smoothstep(Math.min(1, Math.max(0, (z + 0.4) / 0.8))).toFixed(3)) })
	}
	return stops
}

// The depth masks cover the view with a little room to spare; the sliding layer is
// one period wider so it still covers the view at the end of its travel.
const MASK = { x: -6, y: -6, width: VIEW_W + 12, height: VIEW_H + 12 }

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
	`[data-orchestra-mark] [data-om^="strand"] { fill: none; stroke-width: 2.4; stroke-linecap: round; }`,
	`[data-orchestra-mark] [data-om-back] { stroke-width: 1.7; opacity: 0.5; }`,
	`[data-orchestra-mark] [data-om-shift] { animation: orchestra-mark-depth ${DURATION} ${EASING} infinite; }`,
	// A full cycle advances the phase by 2π, which moves the helix one period.
	`@keyframes orchestra-mark-depth { from { transform: translateX(0); } to { transform: translateX(-${PERIOD}px); } }`,
	`[data-orchestra-mark] [data-om^="head"] { fill: ${ACCENT}; stroke: none; transform-box: view-box; transform-origin: 0 0; }`,
	`[data-orchestra-mark] [data-om="strand-a"] { animation: orchestra-mark-wave-a ${DURATION} ${EASING} infinite, orchestra-mark-draw ${INTRO_DRAW} ${INTRO_EASING} both; }`,
	`[data-orchestra-mark] [data-om="strand-b"] { animation: orchestra-mark-wave-b ${DURATION} ${EASING} infinite, orchestra-mark-draw ${INTRO_DRAW} ${INTRO_EASING} both; }`,
	`[data-orchestra-mark] [data-om="head-a"] { animation: orchestra-mark-head-a ${DURATION} ${EASING} infinite, orchestra-mark-launch ${INTRO_LAUNCH} both; }`,
	`[data-orchestra-mark] [data-om="head-b"] { animation: orchestra-mark-head-b ${DURATION} ${EASING} infinite, orchestra-mark-launch ${INTRO_LAUNCH} both; }`,
	`@keyframes orchestra-mark-draw { from { stroke-dasharray: 100 100; stroke-dashoffset: 100; } to { stroke-dasharray: 100 100; stroke-dashoffset: 0; } }`,
	`@keyframes orchestra-mark-launch { from { opacity: 0; translate: -4px 0; } to { opacity: 1; translate: 0 0; } }`,
	`@keyframes orchestra-mark-fade-in { from { opacity: 0; } }`,
	keyframesFor('orchestra-mark-wave-a', p => `d: path("${pathFor(p, -1)}");`),
	keyframesFor('orchestra-mark-wave-b', p => `d: path("${pathFor(p, 1)}");`),
	keyframesFor('orchestra-mark-head-a', p => `transform: ${headTransform(p, -1)};`),
	keyframesFor('orchestra-mark-head-b', p => `transform: ${headTransform(p, 1)};`),
	`[data-orchestra-mark] [data-om-light] { fill: none; stroke-width: 0.9; stroke-linecap: round; stroke-dasharray: 14 86; opacity: 0.85; animation: orchestra-mark-wave-a ${DURATION} ${EASING} infinite, orchestra-mark-signal ${DURATION} cubic-bezier(0.45, 0, 0.55, 1) infinite, orchestra-mark-fade-in ${INTRO_LIGHT} both; }`,
	`[data-orchestra-mark] [data-om-light="b"] { animation-name: orchestra-mark-wave-b, orchestra-mark-signal, orchestra-mark-fade-in; animation-delay: 0s, -1.3s, ${INTRO_LIGHT_DELAY}; }`,
	`@keyframes orchestra-mark-signal { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }`,
	// Falls back to the mark held at its first phase, which the `d` attributes and the
	// inline transforms on the arrowheads already put on screen.
	`@media (prefers-reduced-motion: reduce) {
	[data-orchestra-mark] [data-om], [data-orchestra-mark] [data-om-light], [data-orchestra-mark] [data-om-shift] { animation: none; }
	[data-orchestra-mark] [data-om-light] { display: none; }
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
	const uid = useId().replace(/:/g, '')
	const fadeId = `orchestra-mark-fade-${uid}`
	const sheenId = `orchestra-mark-sheen-${uid}`
	const openId = `orchestra-mark-open-${uid}`
	const depthId = (side: 'a' | 'b') => `orchestra-mark-depth-${side}-${uid}`

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
					<stop offset='0' stopColor='#5e0b16' stopOpacity='0' />
					<stop offset='0.28' stopColor='#8c1223' stopOpacity='0.9' />
					<stop offset='0.65' stopColor='#c01e31' stopOpacity='1' />
					<stop offset='1' stopColor={ACCENT} stopOpacity='1' />
				</linearGradient>
				{/* keeps the sheen off the transparent tail and short of the arrowheads */}
				<linearGradient id={sheenId} x1={X0} y1='0' x2={X_END} y2='0' gradientUnits='userSpaceOnUse'>
					<stop offset='0.2' stopColor='#fff4f5' stopOpacity='0' />
					<stop offset='0.45' stopColor='#fff4f5' stopOpacity='1' />
					<stop offset='0.8' stopColor='#fff4f5' stopOpacity='1' />
					<stop offset='1' stopColor='#fff4f5' stopOpacity='0' />
				</linearGradient>
				{/* past the opening both arms of the fork face the viewer */}
				<linearGradient id={openId} x1={X_OPEN - 5} y1='0' x2={X_OPEN + 6} y2='0' gradientUnits='userSpaceOnUse'>
					<stop offset='0' stopColor='#fff' stopOpacity='0' />
					<stop offset='1' stopColor='#fff' stopOpacity='1' />
				</linearGradient>
				{([['a', -1], ['b', 1]] as const).map(([side, sign]) => (
					<React.Fragment key={side}>
						<linearGradient id={`${depthId(side)}-fill`} x1={X0} y1='0' x2={X0 + PERIOD} y2='0' gradientUnits='userSpaceOnUse' spreadMethod='repeat'>
							{depthStops(sign).map(({ offset, opacity }) => <stop key={offset} offset={offset} stopColor='#fff' stopOpacity={opacity} />)}
						</linearGradient>
						<mask id={depthId(side)} maskUnits='userSpaceOnUse' {...MASK}>
							<rect data-om-shift='' {...MASK} width={MASK.width + PERIOD} fill={`url(#${depthId(side)}-fill)`} />
							<rect {...MASK} fill={`url(#${openId})`} />
						</mask>
					</React.Fragment>
				))}
			</defs>
			{/* both strands whole, thin and dim: what shows where one is behind the other */}
			<path data-om='strand-a' data-om-back='' pathLength={100} d={pathFor(phaseAt(0), -1)} stroke={`url(#${fadeId})`} />
			<path data-om='strand-b' data-om-back='' pathLength={100} d={pathFor(phaseAt(0), 1)} stroke={`url(#${fadeId})`} />
			{/* then each at full weight with its sheen, masked to where it is in front */}
			<g mask={`url(#${depthId('a')})`}>
				<path data-om='strand-a' pathLength={100} d={pathFor(phaseAt(0), -1)} stroke={`url(#${fadeId})`} />
				<path data-om='strand-a' data-om-light='a' pathLength={100} d={pathFor(phaseAt(0), -1)} stroke={`url(#${sheenId})`} />
			</g>
			<g mask={`url(#${depthId('b')})`}>
				<path data-om='strand-b' pathLength={100} d={pathFor(phaseAt(0), 1)} stroke={`url(#${fadeId})`} />
				<path data-om='strand-b' data-om-light='b' pathLength={100} d={pathFor(phaseAt(0), 1)} stroke={`url(#${sheenId})`} />
			</g>
			<polygon data-om='head-a' points={ARROW_POINTS} style={{ transform: headTransform(phaseAt(0), -1) }} />
			<polygon data-om='head-b' points={ARROW_POINTS} style={{ transform: headTransform(phaseAt(0), 1) }} />
		</svg>
	)
}
