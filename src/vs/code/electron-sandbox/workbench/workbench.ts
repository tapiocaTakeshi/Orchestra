/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-restricted-globals */

(async function () {

	// Add a perf entry right from the top
	performance.mark('code/didStartRenderer');

	type INativeWindowConfiguration = import('../../../platform/window/common/window.ts').INativeWindowConfiguration;
	type IBootstrapWindow = import('../../../platform/window/electron-sandbox/window.js').IBootstrapWindow;
	type IMainWindowSandboxGlobals = import('../../../base/parts/sandbox/electron-sandbox/globals.js').IMainWindowSandboxGlobals;
	type IDesktopMain = import('../../../workbench/electron-sandbox/desktop.main.js').IDesktopMain;

	const bootstrapWindow: IBootstrapWindow = (window as any).MonacoBootstrapWindow; 	// defined by bootstrap-window.ts
	const preloadGlobals: IMainWindowSandboxGlobals = (window as any).vscode; 			// defined by preload.ts

	//#region Boot Failure Diagnostics

	// Orchestra: the splash below is the only thing on screen until the workbench has
	// laid out, and nothing takes it down if the boot fails. bootstrap-window only
	// console.errors such a failure, so on a machine where startup breaks the window is
	// left spinning the logo forever with no hint of what happened. Remember the first
	// error here so the splash watchdog can put it on screen.
	let firstBootError: string | undefined = undefined;

	function rememberBootError(error: unknown): void {
		if (firstBootError !== undefined) {
			return; // keep the first error, anything after it is usually fallout
		}

		if (error instanceof Error) {
			firstBootError = error.stack || `${error.name}: ${error.message}`;
		} else if (typeof error === 'string' && error) {
			firstBootError = error;
		} else if (error) {
			try {
				firstBootError = JSON.stringify(error);
			} catch {
				firstBootError = String(error);
			}
		}
	}

	window.addEventListener('error', e => rememberBootError(e.error ?? e.message));
	window.addEventListener('unhandledrejection', e => rememberBootError(e.reason));

	//#endregion

	//#region Splash Screen Helpers

	const SPLASH_LOGO_ELEMENT_ID = 'monaco-workbench-splash-logo';

	// How long the workbench may take to reach its first layout before we treat the boot
	// as hung. Cold starts behind an on-access virus scanner are slow, so stay generous:
	// this is a last resort, not a progress indicator.
	const SPLASH_WATCHDOG_TIMEOUT_MS = 30000;

	// How long a rendered workbench may keep the splash on top of it before we assume
	// nothing is coming to remove it. Comfortably past a healthy first layout.
	const SPLASH_STALE_GRACE_MS = 5000;

	const SPLASH_WATCHDOG_POLL_MS = 500;

	// Colors picked for the splash, reused by the failure screen so it does not flash a
	// different theme at the user.
	let splashShellBackground: string | undefined = undefined;
	let splashShellForeground: string | undefined = undefined;

	// Same cleanup PartsSplash#_removePartsSplash does, for the case where the workbench
	// came up but nothing took the splash down.
	function removeSplash(): void {
		window.document.getElementById(SPLASH_LOGO_ELEMENT_ID)?.remove();
		window.document.getElementById('monaco-parts-splash')?.remove();
		window.document.head.getElementsByClassName('initialShellColors')[0]?.remove();
	}

	function showBootFailure(reason: 'timeout' | 'error'): void {
		const splashLogo = window.document.getElementById(SPLASH_LOGO_ELEMENT_ID);
		if (!splashLogo) {
			return; // splash is already gone, nothing to replace
		}

		performance.mark('code/didFailToBoot');

		// The restored parts (fake title bar, side bar, ...) would sit behind the message
		// and read as a half-loaded editor, so take them down first.
		window.document.getElementById('monaco-parts-splash')?.remove();

		const background = splashShellBackground || '#1e1e1e';
		const foreground = splashShellForeground || '#cccccc';

		// Drop the spinner/logo, then reuse its full-window container for the message.
		splashLogo.textContent = '';
		splashLogo.setAttribute('aria-label', 'Orchestra を起動できませんでした');
		splashLogo.style.flexDirection = 'column';
		splashLogo.style.gap = '12px';
		splashLogo.style.padding = '40px';
		splashLogo.style.boxSizing = 'border-box';
		splashLogo.style.backgroundColor = background;
		splashLogo.style.color = foreground;
		splashLogo.style.pointerEvents = 'auto';
		splashLogo.style.userSelect = 'text';
		splashLogo.style.fontFamily = `system-ui, "Segoe UI", "Yu Gothic UI", -apple-system, sans-serif`;
		splashLogo.style.fontSize = '13px';
		splashLogo.style.overflow = 'auto';

		const title = window.document.createElement('div');
		title.textContent = 'Orchestra を起動できませんでした / Orchestra failed to start';
		title.style.fontSize = '17px';
		title.style.fontWeight = '600';
		splashLogo.appendChild(title);

		const message = window.document.createElement('div');
		message.textContent = reason === 'timeout'
			? `起動処理が ${Math.round(SPLASH_WATCHDOG_TIMEOUT_MS / 1000)} 秒以内に終わりませんでした。下の内容を添えて報告してください。`
			: '起動処理でエラーが発生しました。下の内容を添えて報告してください。';
		message.style.opacity = '.8';
		message.style.textAlign = 'center';
		splashLogo.appendChild(message);

		// The perf marks say how far the boot got, which is the part that actually tells
		// a stalled startup apart from a crashed one (e.g. `willLoadWorkbenchMain`
		// without `didLoadWorkbenchMain` means the workbench bundle never imported).
		const marks = performance.getEntriesByType('mark')
			.filter(mark => mark.name.indexOf('code/') === 0)
			.map(mark => `${Math.round(mark.startTime)}ms ${mark.name}`)
			.join('\n');

		const details = [
			firstBootError || 'No error was reported before the boot stalled.',
			'',
			`platform: ${(preloadGlobals?.process?.platform) ?? 'unknown'}`,
			'boot progress:',
			marks || '(none)'
		].join('\n');

		const detailsElement = window.document.createElement('pre');
		detailsElement.textContent = details;
		detailsElement.style.margin = '0';
		detailsElement.style.padding = '12px';
		detailsElement.style.maxWidth = '760px';
		detailsElement.style.maxHeight = '40vh';
		detailsElement.style.width = '100%';
		detailsElement.style.overflow = 'auto';
		detailsElement.style.whiteSpace = 'pre-wrap';
		detailsElement.style.wordBreak = 'break-word';
		detailsElement.style.fontFamily = `"Cascadia Mono", Consolas, "Courier New", monospace`;
		detailsElement.style.fontSize = '12px';
		detailsElement.style.border = `1px solid ${foreground}33`;
		detailsElement.style.borderRadius = '4px';
		splashLogo.appendChild(detailsElement);

		const buttons = window.document.createElement('div');
		buttons.style.display = 'flex';
		buttons.style.gap = '8px';
		buttons.style.flexWrap = 'wrap';
		buttons.style.justifyContent = 'center';
		splashLogo.appendChild(buttons);

		const addButton = (label: string, run: () => void) => {
			const button = window.document.createElement('button');
			button.textContent = label;
			button.style.font = 'inherit';
			button.style.padding = '6px 14px';
			button.style.color = foreground;
			button.style.backgroundColor = 'transparent';
			button.style.border = `1px solid ${foreground}66`;
			button.style.borderRadius = '4px';
			button.style.cursor = 'pointer';
			button.onclick = run;
			buttons.appendChild(button);
		};

		addButton('再読み込み / Reload', () => preloadGlobals?.ipcRenderer?.send('vscode:reloadWindow'));
		addButton('開発者ツール / Developer Tools', () => preloadGlobals?.ipcRenderer?.send('vscode:openDevTools'));
		addButton('詳細をコピー / Copy details', () => {
			// The window is half-dead at this point, so failing to copy must not throw.
			try {
				navigator.clipboard?.writeText(details).catch(e => console.error(e));
			} catch (e) {
				console.error(e);
			}
		});
	}

	// Orchestra: last line of defense against a window that sits on the loading animation
	// forever. Two things can go wrong, and neither used to leave any way out:
	//  - the workbench came up but nobody took the splash down (PartsSplash is what
	//    normally does it, and it is created through the contribution registry, which
	//    swallows the error when a contribution fails to instantiate). The restored
	//    parts splash covers the real UI, so this looks exactly like a hung startup.
	//  - the boot never finished at all, in which case we owe the user the error.
	function armSplashWatchdog(): void {
		const startedAt = Date.now();

		const handle = setInterval(() => {
			if (!window.document.getElementById(SPLASH_LOGO_ELEMENT_ID)) {
				clearInterval(handle);

				return; // PartsSplash already cleaned up, boot went fine
			}

			const elapsed = Date.now() - startedAt;

			// The workbench is on screen, so the splash is merely stale. Anything past
			// the grace period is well beyond a healthy first layout, so drop it.
			if (elapsed >= SPLASH_STALE_GRACE_MS && window.document.querySelector('.monaco-workbench')) {
				clearInterval(handle);
				removeSplash();

				return;
			}

			if (elapsed >= SPLASH_WATCHDOG_TIMEOUT_MS) {
				clearInterval(handle);
				showBootFailure('timeout');
			}
		}, SPLASH_WATCHDOG_POLL_MS);

		window.addEventListener('beforeunload', () => clearInterval(handle));
	}

	// Orchestra: the brand mark's motion law - two strands weaving around a centre
	// line, blending into a fork that ends in a pair of arrowheads. The chat loading
	// indicator evaluates the same law at a smaller scale (see `OrchestraMark.tsx` in
	// the void React tree); keep the two in step when tuning either. The keyframes are
	// sampled from the curve at startup rather than written out by hand, so there are
	// enough phases per cycle for the weave to glide instead of stepping.
	const SPLASH_CY = 60;
	const SPLASH_X0 = 10;          // both strands emanate from a point on the centre line
	const SPLASH_X_OPEN = 164;     // where the weave starts swinging out into the fork
	const SPLASH_X_END = 232;      // where the strands hand off to the arrowheads
	const SPLASH_PERIOD = 76;
	const SPLASH_AMP = 17;
	const SPLASH_RAMP = 56;        // amplitude eases in, so the tail tapers out of the origin
	const SPLASH_OPEN_BASE = 28;
	const SPLASH_OPEN_WOBBLE = 6;
	const SPLASH_SEGMENTS = 24;
	const SPLASH_FRAMES = 48;
	const SPLASH_ARROW_POINTS = '0,-11 24,0 0,11 7,0';

	const splashSmoothstep = (t: number) => t * t * (3 - 2 * t);
	const splashRound = (v: number) => Number(v.toFixed(2));
	const splashPhaseAt = (frame: number) => (2 * Math.PI * frame) / SPLASH_FRAMES;

	// One strand at a given phase. `side` is -1 for the strand that starts upward.
	function splashStrandY(x: number, phase: number, side: number): number {
		const amp = SPLASH_AMP * Math.min(1, Math.max(0, (x - SPLASH_X0) / SPLASH_RAMP));
		const weave = SPLASH_CY + side * amp * Math.sin((2 * Math.PI * (x - SPLASH_X0)) / SPLASH_PERIOD + phase);
		if (x <= SPLASH_X_OPEN) {
			return weave;
		}

		// Past the opening the weave blends out into the fork, whose spread breathes
		// with the phase so the arrowheads ride the wave.
		const t = splashSmoothstep((x - SPLASH_X_OPEN) / (SPLASH_X_END - SPLASH_X_OPEN));
		const spread = SPLASH_OPEN_BASE + SPLASH_OPEN_WOBBLE * Math.cos(phase);
		return weave * (1 - t) + (SPLASH_CY + side * spread) * t;
	}

	// Catmull-Rom through the sampled points, converted to cubic beziers.
	function splashStrandPath(phase: number, side: number): string {
		const pts: [number, number][] = [];
		for (let i = 0; i <= SPLASH_SEGMENTS; i++) {
			const x = SPLASH_X0 + ((SPLASH_X_END - SPLASH_X0) * i) / SPLASH_SEGMENTS;
			pts.push([x, splashStrandY(x, phase, side)]);
		}

		const at = (i: number) => pts[Math.min(pts.length - 1, Math.max(0, i))];
		let d = `M${splashRound(pts[0][0])},${splashRound(pts[0][1])}`;
		for (let i = 0; i < pts.length - 1; i++) {
			const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
			const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
			const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
			d += ` C${splashRound(c1x)},${splashRound(c1y)} ${splashRound(c2x)},${splashRound(c2y)} ${splashRound(p2[0])},${splashRound(p2[1])}`;
		}
		return d;
	}

	// The arrowhead sits at the strand's end, turned to match its tangent there.
	function splashHeadTransform(phase: number, side: number): string {
		const y = splashStrandY(SPLASH_X_END, phase, side);
		const angle = (Math.atan2(y - splashStrandY(SPLASH_X_END - 0.5, phase, side), 0.5) * 180) / Math.PI;
		return `translate(${SPLASH_X_END}px, ${splashRound(y)}px) rotate(${Number(angle.toFixed(1))}deg)`;
	}

	function splashMotionKeyframes(): string {
		const keyframes = (name: string, at: (phase: number) => string) => {
			const rows: string[] = [];
			for (let f = 0; f <= SPLASH_FRAMES; f++) {
				rows.push(`${splashRound((100 * f) / SPLASH_FRAMES)}% { ${at(splashPhaseAt(f))} }`);
			}
			return `@keyframes ${name} { ${rows.join(' ')} }`;
		};

		return [
			keyframes('monaco-workbench-splash-wave-a', p => `d: path("${splashStrandPath(p, -1)}");`),
			keyframes('monaco-workbench-splash-wave-b', p => `d: path("${splashStrandPath(p, 1)}");`),
			keyframes('monaco-workbench-splash-head-a', p => `transform: ${splashHeadTransform(p, -1)};`),
			keyframes('monaco-workbench-splash-head-b', p => `transform: ${splashHeadTransform(p, 1)};`),
		].join('\n');
	}

	function showSplash(configuration: INativeWindowConfiguration) {
		performance.mark('code/willShowPartsSplash');

		let data = configuration.partsSplash;
		if (data) {
			if (configuration.autoDetectHighContrast && configuration.colorScheme.highContrast) {
				if ((configuration.colorScheme.dark && data.baseTheme !== 'hc-black') || (!configuration.colorScheme.dark && data.baseTheme !== 'hc-light')) {
					data = undefined; // high contrast mode has been turned by the OS -> ignore stored colors and layouts
				}
			} else if (configuration.autoDetectColorScheme) {
				if ((configuration.colorScheme.dark && data.baseTheme !== 'vs-dark') || (!configuration.colorScheme.dark && data.baseTheme !== 'vs')) {
					data = undefined; // OS color scheme is tracked and has changed
				}
			}
		}

		// developing an extension -> ignore stored layouts
		if (data && configuration.extensionDevelopmentPath) {
			data.layoutInfo = undefined;
		}

		// minimal color configuration (works with or without persisted data)
		let baseTheme;
		let shellBackground;
		let shellForeground;
		if (data) {
			baseTheme = data.baseTheme;
			shellBackground = data.colorInfo.editorBackground;
			shellForeground = data.colorInfo.foreground;
		} else if (configuration.autoDetectHighContrast && configuration.colorScheme.highContrast) {
			if (configuration.colorScheme.dark) {
				baseTheme = 'hc-black';
				shellBackground = '#000000';
				shellForeground = '#FFFFFF';
			} else {
				baseTheme = 'hc-light';
				shellBackground = '#FFFFFF';
				shellForeground = '#000000';
			}
		} else if (configuration.autoDetectColorScheme) {
			if (configuration.colorScheme.dark) {
				baseTheme = 'vs-dark';
				shellBackground = '#1E1E1E';
				shellForeground = '#CCCCCC';
			} else {
				baseTheme = 'vs';
				shellBackground = '#FFFFFF';
				shellForeground = '#000000';
			}
		}

		splashShellBackground = shellBackground;
		splashShellForeground = shellForeground;

		// The bloom and the halo behind the mark are a dark-shell treatment: over a
		// light editor background a blurred copy underneath only makes the logo look
		// out of focus, so those themes get the crisp mark on its own.
		const darkShell = (baseTheme ?? 'vs-dark') === 'vs-dark' || baseTheme === 'hc-black';
		const bloom = darkShell ? ' filter: url(#boot-splash-glow);' : '';

		const style = document.createElement('style');
		style.className = 'initialShellColors';
		window.document.head.appendChild(style);
		style.textContent = `
			body { background-color: ${shellBackground}; color: ${shellForeground}; margin: 0; padding: 0; }
			#monaco-workbench-splash-logo { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 18px; background-color: ${shellBackground}; pointer-events: none; overflow: hidden; animation: monaco-workbench-splash-logo-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
			#monaco-workbench-splash-logo svg { overflow: visible; width: min(320px, 80vw); height: auto; flex-shrink: 0; }
			#monaco-workbench-splash-logo .boot-wordmark { font: 500 15px system-ui, sans-serif; letter-spacing: 0.32em; padding-left: 0.32em; white-space: nowrap; }
			#monaco-workbench-splash-logo .boot-wordmark span { display: inline-block; animation: monaco-workbench-splash-letter-in 0.7s calc(0.55s + var(--i) * 45ms) cubic-bezier(0.16, 1, 0.3, 1) both; }
			#monaco-workbench-splash-logo .boot-meter { width: 96px; height: 2px; overflow: hidden; background: rgba(224, 36, 49, 0.12); border-radius: 2px; animation: monaco-workbench-splash-caption-in 0.8s 1.1s both; }
			#monaco-workbench-splash-logo .boot-meter::after { content: ''; display: block; height: 100%; width: 50%; background: linear-gradient(90deg, transparent, #e02431, transparent); animation: monaco-workbench-splash-meter 1.8s ease-in-out infinite; }
			#monaco-workbench-splash-logo .boot-strand.boot-signal { stroke: #ffbac2; stroke-width: 1.8; stroke-dasharray: 8 92; filter: none; }
			#monaco-workbench-splash-logo .boot-strand.boot-signal-a { animation: monaco-workbench-splash-wave-a 4s linear infinite, monaco-workbench-splash-signal 2s linear infinite, monaco-workbench-splash-fade-in 0.5s 1.15s both; }
			#monaco-workbench-splash-logo .boot-strand.boot-signal-b { animation: monaco-workbench-splash-wave-b 4s linear infinite, monaco-workbench-splash-signal 2s -1s linear infinite, monaco-workbench-splash-fade-in 0.5s 1.15s both; }
			@keyframes monaco-workbench-splash-caption-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
			@keyframes monaco-workbench-splash-letter-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
			@keyframes monaco-workbench-splash-fade-in { from { opacity: 0; } to { opacity: 1; } }
			@keyframes monaco-workbench-splash-meter { from { transform: translateX(-100%); } to { transform: translateX(300%); } }
			@keyframes monaco-workbench-splash-signal { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }
			#monaco-workbench-splash-logo .boot-ambient { fill: url(#boot-splash-ambient); animation: monaco-workbench-splash-ambient-in 1.2s 0.2s ease-out both, monaco-workbench-splash-ambient-pulse 4.8s 1.4s ease-in-out infinite; }
			#monaco-workbench-splash-logo .boot-strand { fill: none; stroke: url(#boot-splash-fade); stroke-width: 5; stroke-linecap: round;${bloom} }
			#monaco-workbench-splash-logo .boot-arrowhead { fill: #e02431; stroke: #e02431; stroke-width: 1.4; stroke-linejoin: round; transform-box: view-box; transform-origin: 0 0;${bloom} }
			#monaco-workbench-splash-logo .boot-strand-a { animation: monaco-workbench-splash-wave-a 4s linear infinite, monaco-workbench-splash-draw 1.1s 0.1s cubic-bezier(0.22, 1, 0.36, 1) both; }
			#monaco-workbench-splash-logo .boot-strand-b { animation: monaco-workbench-splash-wave-b 4s linear infinite, monaco-workbench-splash-draw 1.1s 0.1s cubic-bezier(0.22, 1, 0.36, 1) both; }
			#monaco-workbench-splash-logo .boot-arrowhead-a { animation: monaco-workbench-splash-head-a 4s linear infinite, monaco-workbench-splash-launch 0.55s 0.75s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
			#monaco-workbench-splash-logo .boot-arrowhead-b { animation: monaco-workbench-splash-head-b 4s linear infinite, monaco-workbench-splash-launch 0.55s 0.75s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
			@keyframes monaco-workbench-splash-draw {
				from { stroke-dasharray: 100 100; stroke-dashoffset: 100; }
				to   { stroke-dasharray: 100 100; stroke-dashoffset: 0; }
			}
			@keyframes monaco-workbench-splash-launch {
				from { opacity: 0; translate: -18px 0; }
				to   { opacity: 1; translate: 0 0; }
			}
			@keyframes monaco-workbench-splash-ambient-in {
				from { opacity: 0; }
				to   { opacity: 0.55; }
			}
			@keyframes monaco-workbench-splash-logo-in {
				0%   { opacity: 0; transform: scale(0.96); }
				100% { opacity: 1; transform: scale(1); }
			}
			@keyframes monaco-workbench-splash-ambient-pulse {
				0%, 100% { opacity: 0.55; }
				50%      { opacity: 0.9; }
			}
			${splashMotionKeyframes()}
			@media (prefers-reduced-motion: reduce) {
				#monaco-workbench-splash-logo, #monaco-workbench-splash-logo *, #monaco-workbench-splash-logo ::after { animation: none !important; }
				#monaco-workbench-splash-logo .boot-signal { display: none; }
			}
		`;

		// Orchestra: two strands weaving around a centre line the whole width before
		// opening into a pair of arrows, the weave drifting left to right while the
		// workbench boots, lifted by a soft glow filter and a pulsing ambient halo
		// behind it. It opens with the strands drawing out of the origin, the
		// arrowheads launching once the strands reach them and the wordmark settling
		// in a letter at a time; removed with the splash on first layout (see PartsSplash).
		//
		// Built through the DOM rather than innerHTML on purpose: workbench.html sets
		// `require-trusted-types-for 'script'`, so assigning markup here throws and the
		// window comes up with no splash at all.
		const svgNS = 'http://www.w3.org/2000/svg';
		const svgEl = (tag: string, attrs: { [name: string]: string }) => {
			const node = document.createElementNS(svgNS, tag);
			for (const name in attrs) {
				node.setAttribute(name, attrs[name]);
			}
			return node;
		};

		const splashLogo = document.createElement('div');
		splashLogo.id = 'monaco-workbench-splash-logo';
		splashLogo.setAttribute('role', 'status');
		splashLogo.setAttribute('aria-label', 'Orchestra を起動しています');

		const svg = svgEl('svg', { viewBox: '0 0 266 120', width: '320', height: '144', 'aria-hidden': 'true' });

		const gradient = svgEl('linearGradient', {
			id: 'boot-splash-fade', x1: '10', y1: '0', x2: '230', y2: '0', gradientUnits: 'userSpaceOnUse'
		});
		gradient.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#e02431', 'stop-opacity': '0' }));
		gradient.appendChild(svgEl('stop', { offset: '0.3', 'stop-color': '#b81c2c', 'stop-opacity': '0.95' }));
		gradient.appendChild(svgEl('stop', { offset: '0.58', 'stop-color': '#f0455a', 'stop-opacity': '1' }));
		gradient.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#e02431', 'stop-opacity': '1' }));

		const ambient = svgEl('radialGradient', {
			id: 'boot-splash-ambient', cx: '0.5', cy: '0.5', r: '0.5'
		});
		// Eased rather than linear falloff: a straight ramp to zero leaves a visible
		// rim where the halo ends, which reads as a hard edge against flat chrome.
		ambient.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#e02431', 'stop-opacity': '0.2' }));
		ambient.appendChild(svgEl('stop', { offset: '0.35', 'stop-color': '#e02431', 'stop-opacity': '0.13' }));
		ambient.appendChild(svgEl('stop', { offset: '0.6', 'stop-color': '#e02431', 'stop-opacity': '0.06' }));
		ambient.appendChild(svgEl('stop', { offset: '0.82', 'stop-color': '#e02431', 'stop-opacity': '0.015' }));
		ambient.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#e02431', 'stop-opacity': '0' }));

		const glow = svgEl('filter', { id: 'boot-splash-glow', x: '-60%', y: '-60%', width: '220%', height: '220%' });
		glow.appendChild(svgEl('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '2.2', result: 'blur' }));
		const glowMerge = svgEl('feMerge', {});
		glowMerge.appendChild(svgEl('feMergeNode', { in: 'blur' }));
		glowMerge.appendChild(svgEl('feMergeNode', { in: 'SourceGraphic' }));
		glow.appendChild(glowMerge);

		const defs = svgEl('defs', {});
		defs.appendChild(gradient);
		if (darkShell) {
			defs.appendChild(ambient);
			defs.appendChild(glow);
			svg.appendChild(defs);
			svg.appendChild(svgEl('ellipse', { class: 'boot-ambient', cx: '121', cy: '60', rx: '186', ry: '104' }));
		} else {
			svg.appendChild(defs);
		}

		svg.appendChild(svgEl('path', { class: 'boot-strand boot-strand-a', pathLength: '100', d: splashStrandPath(0, -1) }));
		svg.appendChild(svgEl('path', { class: 'boot-strand boot-strand-b', pathLength: '100', d: splashStrandPath(0, 1) }));
		svg.appendChild(svgEl('polygon', {
			class: 'boot-arrowhead boot-arrowhead-a', points: SPLASH_ARROW_POINTS, style: `transform: ${splashHeadTransform(0, -1)}`
		}));
		svg.appendChild(svgEl('polygon', {
			class: 'boot-arrowhead boot-arrowhead-b', points: SPLASH_ARROW_POINTS, style: `transform: ${splashHeadTransform(0, 1)}`
		}));

		// Reuse each strand's geometry so the travelling highlight stays attached.
		for (const side of ['a', 'b']) {
			const strand = svg.querySelector('.boot-strand-' + side);
			if (strand) {
				const signal = strand.cloneNode(false) as SVGElement;
				signal.setAttribute('class', 'boot-strand boot-signal boot-signal-' + side);
				signal.setAttribute('pathLength', '100');
				svg.appendChild(signal);
			}
		}
		splashLogo.appendChild(svg);
		const wordmark = document.createElement('div');
		wordmark.className = 'boot-wordmark';
		// One span per letter so the wordmark can settle in a letter at a time.
		Array.from('ORCHESTRA').forEach((letter, i) => {
			const span = document.createElement('span');
			span.textContent = letter;
			span.style.setProperty('--i', String(i));
			wordmark.appendChild(span);
		});
		wordmark.setAttribute('aria-hidden', 'true');
		splashLogo.appendChild(wordmark);
		const meter = document.createElement('div');
		meter.className = 'boot-meter';
		meter.setAttribute('aria-hidden', 'true');
		splashLogo.appendChild(meter);
		window.document.body.appendChild(splashLogo);

		// set zoom level as soon as possible
		if (typeof data?.zoomLevel === 'number' && typeof preloadGlobals?.webFrame?.setZoomLevel === 'function') {
			preloadGlobals.webFrame.setZoomLevel(data.zoomLevel);
		}

		// restore parts if possible (we might not always store layout info)
		if (data?.layoutInfo) {
			const { layoutInfo, colorInfo } = data;

			const splash = document.createElement('div');
			splash.id = 'monaco-parts-splash';
			splash.className = baseTheme ?? 'vs-dark';

			if (layoutInfo.windowBorder && colorInfo.windowBorder) {
				const borderElement = document.createElement('div');
				borderElement.style.position = 'absolute';
				borderElement.style.width = 'calc(100vw - 2px)';
				borderElement.style.height = 'calc(100vh - 2px)';
				borderElement.style.zIndex = '1'; // allow border above other elements
				borderElement.style.border = `1px solid var(--window-border-color)`;
				borderElement.style.setProperty('--window-border-color', colorInfo.windowBorder);

				if (layoutInfo.windowBorderRadius) {
					borderElement.style.borderRadius = layoutInfo.windowBorderRadius;
				}

				splash.appendChild(borderElement);
			}

			// ensure there is enough space
			layoutInfo.auxiliarySideBarWidth = Math.min(layoutInfo.auxiliarySideBarWidth, window.innerWidth - (layoutInfo.activityBarWidth + layoutInfo.editorPartMinWidth + layoutInfo.sideBarWidth));
			layoutInfo.sideBarWidth = Math.min(layoutInfo.sideBarWidth, window.innerWidth - (layoutInfo.activityBarWidth + layoutInfo.editorPartMinWidth + layoutInfo.auxiliarySideBarWidth));

			// part: title
			if (layoutInfo.titleBarHeight > 0) {
				const titleDiv = document.createElement('div');
				titleDiv.style.position = 'absolute';
				titleDiv.style.width = '100%';
				titleDiv.style.height = `${layoutInfo.titleBarHeight}px`;
				titleDiv.style.left = '0';
				titleDiv.style.top = '0';
				titleDiv.style.backgroundColor = `${colorInfo.titleBarBackground}`;
				(titleDiv.style as any)['-webkit-app-region'] = 'drag';
				splash.appendChild(titleDiv);

				if (colorInfo.titleBarBorder) {
					const titleBorder = document.createElement('div');
					titleBorder.style.position = 'absolute';
					titleBorder.style.width = '100%';
					titleBorder.style.height = '1px';
					titleBorder.style.left = '0';
					titleBorder.style.bottom = '0';
					titleBorder.style.borderBottom = `1px solid ${colorInfo.titleBarBorder}`;
					titleDiv.appendChild(titleBorder);
				}
			}

			// part: activity bar
			if (layoutInfo.activityBarWidth > 0) {
				const activityDiv = document.createElement('div');
				activityDiv.style.position = 'absolute';
				activityDiv.style.width = `${layoutInfo.activityBarWidth}px`;
				activityDiv.style.height = `calc(100% - ${layoutInfo.titleBarHeight + layoutInfo.statusBarHeight}px)`;
				activityDiv.style.top = `${layoutInfo.titleBarHeight}px`;
				if (layoutInfo.sideBarSide === 'left') {
					activityDiv.style.left = '0';
				} else {
					activityDiv.style.right = '0';
				}
				activityDiv.style.backgroundColor = `${colorInfo.activityBarBackground}`;
				splash.appendChild(activityDiv);

				if (colorInfo.activityBarBorder) {
					const activityBorderDiv = document.createElement('div');
					activityBorderDiv.style.position = 'absolute';
					activityBorderDiv.style.width = '1px';
					activityBorderDiv.style.height = '100%';
					activityBorderDiv.style.top = '0';
					if (layoutInfo.sideBarSide === 'left') {
						activityBorderDiv.style.right = '0';
						activityBorderDiv.style.borderRight = `1px solid ${colorInfo.activityBarBorder}`;
					} else {
						activityBorderDiv.style.left = '0';
						activityBorderDiv.style.borderLeft = `1px solid ${colorInfo.activityBarBorder}`;
					}
					activityDiv.appendChild(activityBorderDiv);
				}
			}

			// part: side bar (only when opening workspace/folder)
			if (configuration.workspace && layoutInfo.sideBarWidth > 0) {
				const sideDiv = document.createElement('div');
				sideDiv.style.position = 'absolute';
				sideDiv.style.width = `${layoutInfo.sideBarWidth}px`;
				sideDiv.style.height = `calc(100% - ${layoutInfo.titleBarHeight + layoutInfo.statusBarHeight}px)`;
				sideDiv.style.top = `${layoutInfo.titleBarHeight}px`;
				if (layoutInfo.sideBarSide === 'left') {
					sideDiv.style.left = `${layoutInfo.activityBarWidth}px`;
				} else {
					sideDiv.style.right = `${layoutInfo.activityBarWidth}px`;
				}
				sideDiv.style.backgroundColor = `${colorInfo.sideBarBackground}`;
				splash.appendChild(sideDiv);

				if (colorInfo.sideBarBorder) {
					const sideBorderDiv = document.createElement('div');
					sideBorderDiv.style.position = 'absolute';
					sideBorderDiv.style.width = '1px';
					sideBorderDiv.style.height = '100%';
					sideBorderDiv.style.top = '0';
					sideBorderDiv.style.right = '0';
					if (layoutInfo.sideBarSide === 'left') {
						sideBorderDiv.style.borderRight = `1px solid ${colorInfo.sideBarBorder}`;
					} else {
						sideBorderDiv.style.left = '0';
						sideBorderDiv.style.borderLeft = `1px solid ${colorInfo.sideBarBorder}`;
					}
					sideDiv.appendChild(sideBorderDiv);
				}
			}

			// part: auxiliary sidebar
			if (layoutInfo.auxiliarySideBarWidth > 0) {
				const auxSideDiv = document.createElement('div');
				auxSideDiv.style.position = 'absolute';
				auxSideDiv.style.width = `${layoutInfo.auxiliarySideBarWidth}px`;
				auxSideDiv.style.height = `calc(100% - ${layoutInfo.titleBarHeight + layoutInfo.statusBarHeight}px)`;
				auxSideDiv.style.top = `${layoutInfo.titleBarHeight}px`;
				if (layoutInfo.sideBarSide === 'left') {
					auxSideDiv.style.right = '0';
				} else {
					auxSideDiv.style.left = '0';
				}
				auxSideDiv.style.backgroundColor = `${colorInfo.sideBarBackground}`;
				splash.appendChild(auxSideDiv);

				if (colorInfo.sideBarBorder) {
					const auxSideBorderDiv = document.createElement('div');
					auxSideBorderDiv.style.position = 'absolute';
					auxSideBorderDiv.style.width = '1px';
					auxSideBorderDiv.style.height = '100%';
					auxSideBorderDiv.style.top = '0';
					if (layoutInfo.sideBarSide === 'left') {
						auxSideBorderDiv.style.left = '0';
						auxSideBorderDiv.style.borderLeft = `1px solid ${colorInfo.sideBarBorder}`;
					} else {
						auxSideBorderDiv.style.right = '0';
						auxSideBorderDiv.style.borderRight = `1px solid ${colorInfo.sideBarBorder}`;
					}
					auxSideDiv.appendChild(auxSideBorderDiv);
				}
			}

			// part: statusbar
			if (layoutInfo.statusBarHeight > 0) {
				const statusDiv = document.createElement('div');
				statusDiv.style.position = 'absolute';
				statusDiv.style.width = '100%';
				statusDiv.style.height = `${layoutInfo.statusBarHeight}px`;
				statusDiv.style.bottom = '0';
				statusDiv.style.left = '0';
				if (configuration.workspace && colorInfo.statusBarBackground) {
					statusDiv.style.backgroundColor = colorInfo.statusBarBackground;
				} else if (!configuration.workspace && colorInfo.statusBarNoFolderBackground) {
					statusDiv.style.backgroundColor = colorInfo.statusBarNoFolderBackground;
				}
				splash.appendChild(statusDiv);

				if (colorInfo.statusBarBorder) {
					const statusBorderDiv = document.createElement('div');
					statusBorderDiv.style.position = 'absolute';
					statusBorderDiv.style.width = '100%';
					statusBorderDiv.style.height = '1px';
					statusBorderDiv.style.top = '0';
					statusBorderDiv.style.borderTop = `1px solid ${colorInfo.statusBarBorder}`;
					statusDiv.appendChild(statusBorderDiv);
				}
			}

			window.document.body.appendChild(splash);
		}

		armSplashWatchdog();

		performance.mark('code/didShowPartsSplash');
	}

	//#endregion

	const { result, configuration } = await bootstrapWindow.load<IDesktopMain, INativeWindowConfiguration>('vs/workbench/workbench.desktop.main',
		{
			configureDeveloperSettings: function (windowConfig) {
				return {
					// disable automated devtools opening on error when running extension tests
					// as this can lead to nondeterministic test execution (devtools steals focus)
					forceDisableShowDevtoolsOnError: typeof windowConfig.extensionTestsPath === 'string' || windowConfig['enable-smoke-test-driver'] === true,
					// enable devtools keybindings in extension development window
					forceEnableDeveloperKeybindings: Array.isArray(windowConfig.extensionDevelopmentPath) && windowConfig.extensionDevelopmentPath.length > 0,
					removeDeveloperKeybindingsAfterLoad: true
				};
			},
			beforeImport: function (windowConfig) {

				// Show our splash as early as possible
				showSplash(windowConfig);

				// Code windows have a `vscodeWindowId` property to identify them
				Object.defineProperty(window, 'vscodeWindowId', {
					get: () => windowConfig.windowId
				});

				// It looks like browsers only lazily enable
				// the <canvas> element when needed. Since we
				// leverage canvas elements in our code in many
				// locations, we try to help the browser to
				// initialize canvas when it is idle, right
				// before we wait for the scripts to be loaded.
				window.requestIdleCallback(() => {
					const canvas = document.createElement('canvas');
					const context = canvas.getContext('2d');
					context?.clearRect(0, 0, canvas.width, canvas.height);
					canvas.remove();
				}, { timeout: 50 });

				// Track import() perf
				performance.mark('code/willLoadWorkbenchMain');
			}
		}
	).catch(error => {
		// Orchestra: the workbench bundle itself failed to load. Without this the window
		// keeps spinning the splash and the reason only ever reaches a console that
		// nobody has open.
		rememberBootError(error);
		showBootFailure('error');

		throw error;
	});

	// Mark start of workbench
	performance.mark('code/didLoadWorkbenchMain');

	// Load workbench
	//
	// Orchestra: a rejection here means the workbench never renders, which would otherwise
	// leave the splash animation running forever. Report it on the splash right away
	// instead of waiting the watchdog out.
	result.main(configuration).catch(error => {
		rememberBootError(error);
		showBootFailure('error');
	});
}());
