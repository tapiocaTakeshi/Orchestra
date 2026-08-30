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

		const style = document.createElement('style');
		style.className = 'initialShellColors';
		window.document.head.appendChild(style);
		style.textContent = `
			body { background-color: ${shellBackground}; color: ${shellForeground}; margin: 0; padding: 0; }
			#monaco-workbench-splash-logo { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; pointer-events: none; overflow: visible; }
			#monaco-workbench-splash-logo .boot-strand { fill: none; stroke: url(#boot-splash-fade); stroke-width: 14; stroke-linecap: round; }
			#monaco-workbench-splash-logo .boot-arrowhead { fill: #e02431; stroke: none; }
			#monaco-workbench-splash-logo .boot-strand-a { animation: monaco-workbench-splash-wave-a 3.2s linear infinite; }
			#monaco-workbench-splash-logo .boot-strand-b { animation: monaco-workbench-splash-wave-b 3.2s linear infinite; }
			@keyframes monaco-workbench-splash-wave-a {
				0%     { d: path("M10,30 C14.8,31.7 29.2,36.4 38.8,39.9 C48.3,43.5 57.9,48.3 67.5,51.4 C77.1,54.4 86.7,56.9 96.2,58.4 C105.8,59.8 115.4,59.5 125,60 C134.6,60.5 144.2,60.2 153.8,61.6 C163.3,63.1 172.9,65.6 182.5,68.6 C192.1,71.7 201.7,76.5 211.2,80.1 C220.8,83.6 235.2,88.3 240,90"); }
				12.5%  { d: path("M10,30 C14.8,31.2 29.2,34.2 38.8,37.5 C48.3,40.8 57.9,45.6 67.5,49.5 C77.1,53.4 86.7,58 96.2,60.8 C105.8,63.6 115.4,65.2 125,66.4 C134.6,67.5 144.2,66.8 153.8,67.5 C163.3,68.2 172.9,68.6 182.5,70.5 C192.1,72.4 201.7,75.8 211.2,79.1 C220.8,82.3 235.2,88.2 240,90"); }
				25%    { d: path("M10,30 C14.8,30.8 29.2,32.6 38.8,35.1 C48.3,37.6 57.9,41.1 67.5,45 C77.1,48.9 86.7,54.4 96.2,58.4 C105.8,62.4 115.4,66.5 125,69 C134.6,71.5 144.2,72.4 153.8,73.4 C163.3,74.4 172.9,73.9 182.5,75 C192.1,76.1 201.7,77.6 211.2,80.1 C220.8,82.6 235.2,88.3 240,90"); }
				37.5%  { d: path("M10,30 C14.8,30.7 29.2,32.3 38.8,34.1 C48.3,35.8 57.9,37.4 67.5,40.5 C77.1,43.6 86.7,48.2 96.2,52.5 C105.8,56.8 115.4,62.5 125,66.4 C134.6,70.2 144.2,73.6 153.8,75.8 C163.3,78 172.9,78.4 182.5,79.5 C192.1,80.6 201.7,80.8 211.2,82.5 C220.8,84.2 235.2,88.8 240,90"); }
				50%    { d: path("M10,30 C14.8,30.8 29.2,33.6 38.8,35.1 C48.3,36.5 57.9,36.7 67.5,38.6 C77.1,40.6 86.7,43.1 96.2,46.6 C105.8,50.2 115.4,55.5 125,60 C134.6,64.5 144.2,69.8 153.8,73.4 C163.3,76.9 172.9,79.4 182.5,81.4 C192.1,83.3 201.7,83.5 211.2,84.9 C220.8,86.4 235.2,89.2 240,90"); }
				62.5%  { d: path("M10,30 C14.8,31.2 29.2,35.8 38.8,37.5 C48.3,39.2 57.9,39.4 67.5,40.5 C77.1,41.6 86.7,42 96.2,44.2 C105.8,46.4 115.4,49.8 125,53.6 C134.6,57.5 144.2,63.2 153.8,67.5 C163.3,71.8 172.9,76.4 182.5,79.5 C192.1,82.6 201.7,84.2 211.2,85.9 C220.8,87.7 235.2,89.3 240,90"); }
				75%    { d: path("M10,30 C14.8,31.7 29.2,37.4 38.8,39.9 C48.3,42.4 57.9,43.9 67.5,45 C77.1,46.1 86.7,45.6 96.2,46.6 C105.8,47.6 115.4,48.5 125,51 C134.6,53.5 144.2,57.6 153.8,61.6 C163.3,65.6 172.9,71.1 182.5,75 C192.1,78.9 201.7,82.4 211.2,84.9 C220.8,87.4 235.2,89.2 240,90"); }
				87.5%  { d: path("M10,30 C14.8,31.8 29.2,37.7 38.8,40.9 C48.3,44.2 57.9,47.6 67.5,49.5 C77.1,51.4 86.7,51.8 96.2,52.5 C105.8,53.2 115.4,52.5 125,53.6 C134.6,54.8 144.2,56.4 153.8,59.2 C163.3,62 172.9,66.6 182.5,70.5 C192.1,74.4 201.7,79.2 211.2,82.5 C220.8,85.8 235.2,88.8 240,90"); }
				100%  { d: path("M10,30 C14.8,31.7 29.2,36.4 38.8,39.9 C48.3,43.5 57.9,48.3 67.5,51.4 C77.1,54.4 86.7,56.9 96.2,58.4 C105.8,59.8 115.4,59.5 125,60 C134.6,60.5 144.2,60.2 153.8,61.6 C163.3,63.1 172.9,65.6 182.5,68.6 C192.1,71.7 201.7,76.5 211.2,80.1 C220.8,83.6 235.2,88.3 240,90"); }
			}
			@keyframes monaco-workbench-splash-wave-b {
				0%     { d: path("M10,90 C14.8,88.3 29.2,83.6 38.8,80.1 C48.3,76.5 57.9,71.7 67.5,68.6 C77.1,65.6 86.7,63.1 96.2,61.6 C105.8,60.2 115.4,60.5 125,60 C134.6,59.5 144.2,59.8 153.8,58.4 C163.3,56.9 172.9,54.4 182.5,51.4 C192.1,48.3 201.7,43.5 211.2,39.9 C220.8,36.4 235.2,31.7 240,30"); }
				12.5%  { d: path("M10,90 C14.8,88.8 29.2,85.8 38.8,82.5 C48.3,79.2 57.9,74.4 67.5,70.5 C77.1,66.6 86.7,62 96.2,59.2 C105.8,56.4 115.4,54.8 125,53.6 C134.6,52.5 144.2,53.2 153.8,52.5 C163.3,51.8 172.9,51.4 182.5,49.5 C192.1,47.6 201.7,44.2 211.2,40.9 C220.8,37.7 235.2,31.8 240,30"); }
				25%    { d: path("M10,90 C14.8,89.2 29.2,87.4 38.8,84.9 C48.3,82.4 57.9,78.9 67.5,75 C77.1,71.1 86.7,65.6 96.2,61.6 C105.8,57.6 115.4,53.5 125,51 C134.6,48.5 144.2,47.6 153.8,46.6 C163.3,45.6 172.9,46.1 182.5,45 C192.1,43.9 201.7,42.4 211.2,39.9 C220.8,37.4 235.2,31.7 240,30"); }
				37.5%  { d: path("M10,90 C14.8,89.3 29.2,87.7 38.8,85.9 C48.3,84.2 57.9,82.6 67.5,79.5 C77.1,76.4 86.7,71.8 96.2,67.5 C105.8,63.2 115.4,57.5 125,53.6 C134.6,49.8 144.2,46.4 153.8,44.2 C163.3,42 172.9,41.6 182.5,40.5 C192.1,39.4 201.7,39.2 211.2,37.5 C220.8,35.8 235.2,31.2 240,30"); }
				50%    { d: path("M10,90 C14.8,89.2 29.2,86.4 38.8,84.9 C48.3,83.5 57.9,83.3 67.5,81.4 C77.1,79.4 86.7,76.9 96.2,73.4 C105.8,69.8 115.4,64.5 125,60 C134.6,55.5 144.2,50.2 153.8,46.6 C163.3,43.1 172.9,40.6 182.5,38.6 C192.1,36.7 201.7,36.5 211.2,35.1 C220.8,33.6 235.2,30.8 240,30"); }
				62.5%  { d: path("M10,90 C14.8,88.8 29.2,84.2 38.8,82.5 C48.3,80.8 57.9,80.6 67.5,79.5 C77.1,78.4 86.7,78 96.2,75.8 C105.8,73.6 115.4,70.2 125,66.4 C134.6,62.5 144.2,56.8 153.8,52.5 C163.3,48.2 172.9,43.6 182.5,40.5 C192.1,37.4 201.7,35.8 211.2,34.1 C220.8,32.3 235.2,30.7 240,30"); }
				75%    { d: path("M10,90 C14.8,88.3 29.2,82.6 38.8,80.1 C48.3,77.6 57.9,76.1 67.5,75 C77.1,73.9 86.7,74.4 96.2,73.4 C105.8,72.4 115.4,71.5 125,69 C134.6,66.5 144.2,62.4 153.8,58.4 C163.3,54.4 172.9,48.9 182.5,45 C192.1,41.1 201.7,37.6 211.2,35.1 C220.8,32.6 235.2,30.8 240,30"); }
				87.5%  { d: path("M10,90 C14.8,88.2 29.2,82.3 38.8,79.1 C48.3,75.8 57.9,72.4 67.5,70.5 C77.1,68.6 86.7,68.2 96.2,67.5 C105.8,66.8 115.4,67.5 125,66.4 C134.6,65.2 144.2,63.6 153.8,60.8 C163.3,58 172.9,53.4 182.5,49.5 C192.1,45.6 201.7,40.8 211.2,37.5 C220.8,34.2 235.2,31.2 240,30"); }
				100%  { d: path("M10,90 C14.8,88.3 29.2,83.6 38.8,80.1 C48.3,76.5 57.9,71.7 67.5,68.6 C77.1,65.6 86.7,63.1 96.2,61.6 C105.8,60.2 115.4,60.5 125,60 C134.6,59.5 144.2,59.8 153.8,58.4 C163.3,56.9 172.9,54.4 182.5,51.4 C192.1,48.3 201.7,43.5 211.2,39.9 C220.8,36.4 235.2,31.7 240,30"); }
			}
			@media (prefers-reduced-motion: reduce) { #monaco-workbench-splash-logo .boot-strand-a, #monaco-workbench-splash-logo .boot-strand-b { animation: none; } }
		`;

		// Orchestra: two crossing arrows with a wave travelling along them, shown centered
		// over the shell background while the workbench boots; removed alongside the
		// color/layout splash on first layout (see PartsSplash#_removePartsSplash).
		const splashLogo = document.createElement('div');
		splashLogo.id = 'monaco-workbench-splash-logo';
		splashLogo.innerHTML = `
			<svg viewBox="0 0 320 120" width="320" height="120">
				<defs>
					<linearGradient id="boot-splash-fade" x1="10" y1="0" x2="240" y2="0" gradientUnits="userSpaceOnUse">
						<stop offset="0" stop-color="#e02431" stop-opacity="0" />
						<stop offset="0.4" stop-color="#e02431" stop-opacity="1" />
						<stop offset="1" stop-color="#e02431" stop-opacity="1" />
					</linearGradient>
				</defs>
				<g>
					<path class="boot-strand boot-strand-a" d="M10,30 C14.8,31.7 29.2,36.4 38.8,39.9 C48.3,43.5 57.9,48.3 67.5,51.4 C77.1,54.4 86.7,56.9 96.2,58.4 C105.8,59.8 115.4,59.5 125,60 C134.6,60.5 144.2,60.2 153.8,61.6 C163.3,63.1 172.9,65.6 182.5,68.6 C192.1,71.7 201.7,76.5 211.2,80.1 C220.8,83.6 235.2,88.3 240,90" />
					<path class="boot-strand boot-strand-b" d="M10,90 C14.8,88.3 29.2,83.6 38.8,80.1 C48.3,76.5 57.9,71.7 67.5,68.6 C77.1,65.6 86.7,63.1 96.2,61.6 C105.8,60.2 115.4,60.5 125,60 C134.6,59.5 144.2,59.8 153.8,58.4 C163.3,56.9 172.9,54.4 182.5,51.4 C192.1,48.3 201.7,43.5 211.2,39.9 C220.8,36.4 235.2,31.7 240,30" />
					<polygon class="boot-arrowhead" points="232,68 272,90 232,112" />
					<polygon class="boot-arrowhead" points="232,8 272,30 232,52" />
				</g>
			</svg>
		`;
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
