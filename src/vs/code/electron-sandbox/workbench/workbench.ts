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
			#monaco-workbench-splash-logo .boot-strand { fill: none; stroke: url(#boot-splash-fade); stroke-width: 11; stroke-linecap: round; }
			#monaco-workbench-splash-logo .boot-arrowhead { fill: #e02431; stroke: none; transform-box: view-box; transform-origin: 0 0; }
			#monaco-workbench-splash-logo .boot-strand-a { animation: monaco-workbench-splash-wave-a 3.2s linear infinite; }
			#monaco-workbench-splash-logo .boot-strand-b { animation: monaco-workbench-splash-wave-b 3.2s linear infinite; }
			#monaco-workbench-splash-logo .boot-arrowhead-a { animation: monaco-workbench-splash-head-a 3.2s linear infinite; }
			#monaco-workbench-splash-logo .boot-arrowhead-b { animation: monaco-workbench-splash-head-b 3.2s linear infinite; }
			@keyframes monaco-workbench-splash-wave-a {
				0%       { d: path("M10,60 C12.1,59.7 18.2,57.9 22.3,58.2 C26.4,58.4 30.6,59.1 34.7,61.6 C38.8,64.1 42.9,70.7 47,73.3 C51.1,75.8 55.2,78.1 59.3,76.9 C63.4,75.7 67.6,70.5 71.7,66.2 C75.8,61.8 79.9,55 84,51 C88.1,47 92.2,43.1 96.3,42.3 C100.4,41.5 104.6,43.3 108.7,46.2 C112.8,49.2 116.9,55.4 121,60 C125.1,64.6 129.2,70.8 133.3,73.8 C137.4,76.7 141.6,78.5 145.7,77.7 C149.8,76.9 153.9,73 158,69 C162.1,65 166.2,58.2 170.3,53.8 C174.4,49.5 178.6,45.1 182.7,42.8 C186.8,40.5 190.9,40.3 195,40.3 C199.1,40.2 203.2,42.2 207.3,42.4 C211.4,42.6 215.6,41.9 219.7,41.4 C223.8,40.9 229.9,39.6 232,39.2"); }
				12.5%    { d: path("M10,60 C12.1,59.5 18.2,58 22.3,57.1 C26.4,56.3 30.6,53.6 34.7,54.8 C38.8,55.9 42.9,60.4 47,64 C51.1,67.6 55.2,74.3 59.3,76.3 C63.4,78.4 67.6,78.3 71.7,76.3 C75.8,74.4 79.9,69.1 84,64.7 C88.1,60.2 92.2,53.4 96.3,49.7 C100.4,45.9 104.6,42.5 108.7,42.1 C112.8,41.7 116.9,44 121,47.3 C125.1,50.5 129.2,57 133.3,61.6 C137.4,66.1 141.6,72.1 145.7,74.7 C149.8,77.4 153.9,78.6 158,77.4 C162.1,76.2 166.2,71.8 170.3,67.6 C174.4,63.4 178.6,56.8 182.7,52 C186.8,47.2 190.9,41.6 195,38.7 C199.1,35.8 203.2,35.2 207.3,34.6 C211.4,34 215.6,34.6 219.7,35.1 C223.8,35.5 229.9,36.8 232,37.1"); }
				25%      { d: path("M10,60 C12.1,59.6 18.2,59.3 22.3,57.8 C26.4,56.3 30.6,51.9 34.7,51 C38.8,50.1 42.9,49.8 47,52.3 C51.1,54.9 55.2,62.1 59.3,66.2 C63.4,70.3 67.6,75.3 71.7,76.9 C75.8,78.5 79.9,77.9 84,75.6 C88.1,73.3 92.2,67.7 96.3,63.1 C100.4,58.6 104.6,52 108.7,48.4 C112.8,44.9 116.9,42 121,42 C125.1,42 129.2,44.9 133.3,48.4 C137.4,52 141.6,58.6 145.7,63.1 C149.8,67.7 153.9,73.3 158,75.6 C162.1,77.9 166.2,78.6 170.3,76.9 C174.4,75.3 178.6,70.8 182.7,65.7 C186.8,60.5 190.9,51.5 195,46 C199.1,40.5 203.2,35.4 207.3,32.6 C211.4,29.8 215.6,29.3 219.7,29.2 C223.8,29.1 229.9,31.5 232,32"); }
				37.5%    { d: path("M10,60 C12.1,60 18.2,61 22.3,59.8 C26.4,58.5 30.6,54.9 34.7,52.5 C38.8,50.1 42.9,45.2 47,45.2 C51.1,45.2 55.2,48.7 59.3,52.4 C63.4,56.1 67.6,63.4 71.7,67.6 C75.8,71.8 79.9,76.2 84,77.4 C88.1,78.6 92.2,77.4 96.3,74.7 C100.4,72.1 104.6,66.1 108.7,61.6 C112.8,57 116.9,50.5 121,47.3 C125.1,44 129.2,41.7 133.3,42.1 C137.4,42.5 141.6,45.9 145.7,49.7 C149.8,53.4 153.9,60.2 158,64.7 C162.1,69.1 166.2,74.5 170.3,76.3 C174.4,78.2 178.6,78.8 182.7,75.7 C186.8,72.6 190.9,64.2 195,57.8 C199.1,51.4 203.2,42.7 207.3,37.6 C211.4,32.5 215.6,28.9 219.7,27.2 C223.8,25.4 229.9,27 232,26.9"); }
				50%      { d: path("M10,60 C12.1,60.3 18.2,62.1 22.3,61.8 C26.4,61.6 30.6,60.9 34.7,58.4 C38.8,55.9 42.9,49.3 47,46.7 C51.1,44.2 55.2,41.9 59.3,43.1 C63.4,44.3 67.6,49.5 71.7,53.8 C75.8,58.2 79.9,65 84,69 C88.1,73 92.2,76.9 96.3,77.7 C100.4,78.5 104.6,76.7 108.7,73.8 C112.8,70.8 116.9,64.6 121,60 C125.1,55.4 129.2,49.2 133.3,46.2 C137.4,43.3 141.6,41.5 145.7,42.3 C149.8,43.1 153.9,47 158,51 C162.1,55 166.2,61.9 170.3,66.2 C174.4,70.4 178.6,76.1 182.7,76.3 C186.8,76.5 190.9,72.2 195,67.3 C199.1,62.3 203.2,52.7 207.3,46.5 C211.4,40.4 215.6,33.9 219.7,30.2 C223.8,26.6 229.9,25.7 232,24.8"); }
				62.5%    { d: path("M10,60 C12.1,60.5 18.2,62 22.3,62.9 C26.4,63.7 30.6,66.4 34.7,65.2 C38.8,64.1 42.9,59.6 47,56 C51.1,52.4 55.2,45.7 59.3,43.7 C63.4,41.6 67.6,41.7 71.7,43.7 C75.8,45.6 79.9,50.9 84,55.3 C88.1,59.8 92.2,66.6 96.3,70.3 C100.4,74.1 104.6,77.5 108.7,77.9 C112.8,78.3 116.9,76 121,72.7 C125.1,69.5 129.2,63 133.3,58.4 C137.4,53.9 141.6,47.9 145.7,45.3 C149.8,42.6 153.9,41.4 158,42.6 C162.1,43.8 166.2,48.3 170.3,52.4 C174.4,56.5 178.6,64.4 182.7,67.1 C186.8,69.8 190.9,71 195,68.8 C199.1,66.7 203.2,59.7 207.3,54.3 C211.4,48.9 215.6,41.1 219.7,36.6 C223.8,32 229.9,28.5 232,26.9"); }
				75%      { d: path("M10,60 C12.1,60.4 18.2,60.7 22.3,62.2 C26.4,63.7 30.6,68.1 34.7,69 C38.8,69.9 42.9,70.2 47,67.7 C51.1,65.1 55.2,57.9 59.3,53.8 C63.4,49.7 67.6,44.7 71.7,43.1 C75.8,41.5 79.9,42.1 84,44.4 C88.1,46.7 92.2,52.3 96.3,56.9 C100.4,61.4 104.6,68 108.7,71.6 C112.8,75.1 116.9,78 121,78 C125.1,78 129.2,75.1 133.3,71.6 C137.4,68 141.6,61.4 145.7,56.9 C149.8,52.3 153.9,46.7 158,44.4 C162.1,42.1 166.2,41.6 170.3,43.1 C174.4,44.6 178.6,50.4 182.7,53.5 C186.8,56.5 190.9,61.1 195,61.6 C199.1,62 203.2,59.5 207.3,56.3 C211.4,53.1 215.6,46.5 219.7,42.4 C223.8,38.4 229.9,33.7 232,32"); }
				87.5%    { d: path("M10,60 C12.1,60 18.2,59 22.3,60.2 C26.4,61.5 30.6,65.1 34.7,67.5 C38.8,69.9 42.9,74.8 47,74.8 C51.1,74.8 55.2,71.3 59.3,67.6 C63.4,63.9 67.6,56.6 71.7,52.4 C75.8,48.2 79.9,43.8 84,42.6 C88.1,41.4 92.2,42.6 96.3,45.3 C100.4,47.9 104.6,53.9 108.7,58.4 C112.8,63 116.9,69.5 121,72.7 C125.1,76 129.2,78.3 133.3,77.9 C137.4,77.5 141.6,74.1 145.7,70.3 C149.8,66.6 153.9,59.8 158,55.3 C162.1,50.9 166.2,45.7 170.3,43.7 C174.4,41.7 178.6,42.4 182.7,43.4 C186.8,44.4 190.9,48.4 195,49.7 C199.1,51 203.2,52.2 207.3,51.3 C211.4,50.5 215.6,46.8 219.7,44.4 C223.8,42.1 229.9,38.3 232,37.1"); }
				100%     { d: path("M10,60 C12.1,59.7 18.2,57.9 22.3,58.2 C26.4,58.4 30.6,59.1 34.7,61.6 C38.8,64.1 42.9,70.7 47,73.3 C51.1,75.8 55.2,78.1 59.3,76.9 C63.4,75.7 67.6,70.5 71.7,66.2 C75.8,61.8 79.9,55 84,51 C88.1,47 92.2,43.1 96.3,42.3 C100.4,41.5 104.6,43.3 108.7,46.2 C112.8,49.2 116.9,55.4 121,60 C125.1,64.6 129.2,70.8 133.3,73.8 C137.4,76.7 141.6,78.5 145.7,77.7 C149.8,76.9 153.9,73 158,69 C162.1,65 166.2,58.2 170.3,53.8 C174.4,49.5 178.6,45.1 182.7,42.8 C186.8,40.5 190.9,40.3 195,40.3 C199.1,40.2 203.2,42.2 207.3,42.4 C211.4,42.6 215.6,41.9 219.7,41.4 C223.8,40.9 229.9,39.6 232,39.2"); }
			}
			@keyframes monaco-workbench-splash-wave-b {
				0%       { d: path("M10,60 C12.1,60.3 18.2,62.1 22.3,61.8 C26.4,61.6 30.6,60.9 34.7,58.4 C38.8,55.9 42.9,49.3 47,46.7 C51.1,44.2 55.2,41.9 59.3,43.1 C63.4,44.3 67.6,49.5 71.7,53.8 C75.8,58.2 79.9,65 84,69 C88.1,73 92.2,76.9 96.3,77.7 C100.4,78.5 104.6,76.7 108.7,73.8 C112.8,70.8 116.9,64.6 121,60 C125.1,55.4 129.2,49.2 133.3,46.2 C137.4,43.3 141.6,41.5 145.7,42.3 C149.8,43.1 153.9,47 158,51 C162.1,55 166.2,61.8 170.3,66.2 C174.4,70.5 178.6,74.9 182.7,77.2 C186.8,79.5 190.9,79.7 195,79.7 C199.1,79.8 203.2,77.8 207.3,77.6 C211.4,77.4 215.6,78.1 219.7,78.6 C223.8,79.1 229.9,80.4 232,80.8"); }
				12.5%    { d: path("M10,60 C12.1,60.5 18.2,62 22.3,62.9 C26.4,63.7 30.6,66.4 34.7,65.2 C38.8,64.1 42.9,59.6 47,56 C51.1,52.4 55.2,45.7 59.3,43.7 C63.4,41.6 67.6,41.7 71.7,43.7 C75.8,45.6 79.9,50.9 84,55.3 C88.1,59.8 92.2,66.6 96.3,70.3 C100.4,74.1 104.6,77.5 108.7,77.9 C112.8,78.3 116.9,76 121,72.7 C125.1,69.5 129.2,63 133.3,58.4 C137.4,53.9 141.6,47.9 145.7,45.3 C149.8,42.6 153.9,41.4 158,42.6 C162.1,43.8 166.2,48.2 170.3,52.4 C174.4,56.6 178.6,63.2 182.7,68 C186.8,72.8 190.9,78.4 195,81.3 C199.1,84.2 203.2,84.8 207.3,85.4 C211.4,86 215.6,85.4 219.7,84.9 C223.8,84.5 229.9,83.2 232,82.9"); }
				25%      { d: path("M10,60 C12.1,60.4 18.2,60.7 22.3,62.2 C26.4,63.7 30.6,68.1 34.7,69 C38.8,69.9 42.9,70.2 47,67.7 C51.1,65.1 55.2,57.9 59.3,53.8 C63.4,49.7 67.6,44.7 71.7,43.1 C75.8,41.5 79.9,42.1 84,44.4 C88.1,46.7 92.2,52.3 96.3,56.9 C100.4,61.4 104.6,68 108.7,71.6 C112.8,75.1 116.9,78 121,78 C125.1,78 129.2,75.1 133.3,71.6 C137.4,68 141.6,61.4 145.7,56.9 C149.8,52.3 153.9,46.7 158,44.4 C162.1,42.1 166.2,41.4 170.3,43.1 C174.4,44.7 178.6,49.2 182.7,54.3 C186.8,59.5 190.9,68.5 195,74 C199.1,79.5 203.2,84.6 207.3,87.4 C211.4,90.2 215.6,90.7 219.7,90.8 C223.8,90.9 229.9,88.5 232,88"); }
				37.5%    { d: path("M10,60 C12.1,60 18.2,59 22.3,60.2 C26.4,61.5 30.6,65.1 34.7,67.5 C38.8,69.9 42.9,74.8 47,74.8 C51.1,74.8 55.2,71.3 59.3,67.6 C63.4,63.9 67.6,56.6 71.7,52.4 C75.8,48.2 79.9,43.8 84,42.6 C88.1,41.4 92.2,42.6 96.3,45.3 C100.4,47.9 104.6,53.9 108.7,58.4 C112.8,63 116.9,69.5 121,72.7 C125.1,76 129.2,78.3 133.3,77.9 C137.4,77.5 141.6,74.1 145.7,70.3 C149.8,66.6 153.9,59.8 158,55.3 C162.1,50.9 166.2,45.5 170.3,43.7 C174.4,41.8 178.6,41.2 182.7,44.3 C186.8,47.4 190.9,55.8 195,62.2 C199.1,68.6 203.2,77.3 207.3,82.4 C211.4,87.5 215.6,91.1 219.7,92.8 C223.8,94.6 229.9,93 232,93.1"); }
				50%      { d: path("M10,60 C12.1,59.7 18.2,57.9 22.3,58.2 C26.4,58.4 30.6,59.1 34.7,61.6 C38.8,64.1 42.9,70.7 47,73.3 C51.1,75.8 55.2,78.1 59.3,76.9 C63.4,75.7 67.6,70.5 71.7,66.2 C75.8,61.8 79.9,55 84,51 C88.1,47 92.2,43.1 96.3,42.3 C100.4,41.5 104.6,43.3 108.7,46.2 C112.8,49.2 116.9,55.4 121,60 C125.1,64.6 129.2,70.8 133.3,73.8 C137.4,76.7 141.6,78.5 145.7,77.7 C149.8,76.9 153.9,73 158,69 C162.1,65 166.2,58.1 170.3,53.8 C174.4,49.6 178.6,43.9 182.7,43.7 C186.8,43.5 190.9,47.8 195,52.7 C199.1,57.7 203.2,67.3 207.3,73.5 C211.4,79.6 215.6,86.1 219.7,89.8 C223.8,93.4 229.9,94.3 232,95.2"); }
				62.5%    { d: path("M10,60 C12.1,59.5 18.2,58 22.3,57.1 C26.4,56.3 30.6,53.6 34.7,54.8 C38.8,55.9 42.9,60.4 47,64 C51.1,67.6 55.2,74.3 59.3,76.3 C63.4,78.4 67.6,78.3 71.7,76.3 C75.8,74.4 79.9,69.1 84,64.7 C88.1,60.2 92.2,53.4 96.3,49.7 C100.4,45.9 104.6,42.5 108.7,42.1 C112.8,41.7 116.9,44 121,47.3 C125.1,50.5 129.2,57 133.3,61.6 C137.4,66.1 141.6,72.1 145.7,74.7 C149.8,77.4 153.9,78.6 158,77.4 C162.1,76.2 166.2,71.7 170.3,67.6 C174.4,63.5 178.6,55.6 182.7,52.9 C186.8,50.2 190.9,49 195,51.2 C199.1,53.3 203.2,60.3 207.3,65.7 C211.4,71.1 215.6,78.9 219.7,83.4 C223.8,88 229.9,91.5 232,93.1"); }
				75%      { d: path("M10,60 C12.1,59.6 18.2,59.3 22.3,57.8 C26.4,56.3 30.6,51.9 34.7,51 C38.8,50.1 42.9,49.8 47,52.3 C51.1,54.9 55.2,62.1 59.3,66.2 C63.4,70.3 67.6,75.3 71.7,76.9 C75.8,78.5 79.9,77.9 84,75.6 C88.1,73.3 92.2,67.7 96.3,63.1 C100.4,58.6 104.6,52 108.7,48.4 C112.8,44.9 116.9,42 121,42 C125.1,42 129.2,44.9 133.3,48.4 C137.4,52 141.6,58.6 145.7,63.1 C149.8,67.7 153.9,73.3 158,75.6 C162.1,77.9 166.2,78.4 170.3,76.9 C174.4,75.4 178.6,69.6 182.7,66.5 C186.8,63.5 190.9,58.9 195,58.4 C199.1,58 203.2,60.5 207.3,63.7 C211.4,66.9 215.6,73.5 219.7,77.6 C223.8,81.6 229.9,86.3 232,88"); }
				87.5%    { d: path("M10,60 C12.1,60 18.2,61 22.3,59.8 C26.4,58.5 30.6,54.9 34.7,52.5 C38.8,50.1 42.9,45.2 47,45.2 C51.1,45.2 55.2,48.7 59.3,52.4 C63.4,56.1 67.6,63.4 71.7,67.6 C75.8,71.8 79.9,76.2 84,77.4 C88.1,78.6 92.2,77.4 96.3,74.7 C100.4,72.1 104.6,66.1 108.7,61.6 C112.8,57 116.9,50.5 121,47.3 C125.1,44 129.2,41.7 133.3,42.1 C137.4,42.5 141.6,45.9 145.7,49.7 C149.8,53.4 153.9,60.2 158,64.7 C162.1,69.1 166.2,74.3 170.3,76.3 C174.4,78.3 178.6,77.6 182.7,76.6 C186.8,75.6 190.9,71.6 195,70.3 C199.1,69 203.2,67.8 207.3,68.7 C211.4,69.5 215.6,73.2 219.7,75.6 C223.8,77.9 229.9,81.7 232,82.9"); }
				100%     { d: path("M10,60 C12.1,60.3 18.2,62.1 22.3,61.8 C26.4,61.6 30.6,60.9 34.7,58.4 C38.8,55.9 42.9,49.3 47,46.7 C51.1,44.2 55.2,41.9 59.3,43.1 C63.4,44.3 67.6,49.5 71.7,53.8 C75.8,58.2 79.9,65 84,69 C88.1,73 92.2,76.9 96.3,77.7 C100.4,78.5 104.6,76.7 108.7,73.8 C112.8,70.8 116.9,64.6 121,60 C125.1,55.4 129.2,49.2 133.3,46.2 C137.4,43.3 141.6,41.5 145.7,42.3 C149.8,43.1 153.9,47 158,51 C162.1,55 166.2,61.8 170.3,66.2 C174.4,70.5 178.6,74.9 182.7,77.2 C186.8,79.5 190.9,79.7 195,79.7 C199.1,79.8 203.2,77.8 207.3,77.6 C211.4,77.4 215.6,78.1 219.7,78.6 C223.8,79.1 229.9,80.4 232,80.8"); }
			}
			@keyframes monaco-workbench-splash-head-a {
				0%       { transform: translate(232px, 39.2px) rotate(-0.1deg); }
				12.5%    { transform: translate(232px, 37.1px) rotate(8.8deg); }
				25%      { transform: translate(232px, 32px) rotate(12deg); }
				37.5%    { transform: translate(232px, 26.9px) rotate(8.7deg); }
				50%      { transform: translate(232px, 24.8px) rotate(-0.2deg); }
				62.5%    { transform: translate(232px, 26.9px) rotate(-9.1deg); }
				75%      { transform: translate(232px, 32px) rotate(-12.3deg); }
				87.5%    { transform: translate(232px, 37.1px) rotate(-9deg); }
				100%     { transform: translate(232px, 39.2px) rotate(-0.1deg); }
			}
			@keyframes monaco-workbench-splash-head-b {
				0%       { transform: translate(232px, 80.8px) rotate(0.1deg); }
				12.5%    { transform: translate(232px, 82.9px) rotate(-8.8deg); }
				25%      { transform: translate(232px, 88px) rotate(-12deg); }
				37.5%    { transform: translate(232px, 93.1px) rotate(-8.7deg); }
				50%      { transform: translate(232px, 95.2px) rotate(0.2deg); }
				62.5%    { transform: translate(232px, 93.1px) rotate(9.1deg); }
				75%      { transform: translate(232px, 88px) rotate(12.3deg); }
				87.5%    { transform: translate(232px, 82.9px) rotate(9deg); }
				100%     { transform: translate(232px, 80.8px) rotate(0.1deg); }
			}
			@media (prefers-reduced-motion: reduce) { #monaco-workbench-splash-logo .boot-strand-a, #monaco-workbench-splash-logo .boot-strand-b, #monaco-workbench-splash-logo .boot-arrowhead-a, #monaco-workbench-splash-logo .boot-arrowhead-b { animation: none; } }
		`;

		// Orchestra: two strands weaving around a centre line the whole width before
		// opening into a pair of arrows, the weave drifting left to right while the
		// workbench boots; removed with the splash on first layout (see PartsSplash).
		const splashLogo = document.createElement('div');
		splashLogo.id = 'monaco-workbench-splash-logo';
		splashLogo.innerHTML = `
			<svg viewBox="0 0 320 120" width="320" height="120">
				<defs>
					<linearGradient id="boot-splash-fade" x1="10" y1="0" x2="230" y2="0" gradientUnits="userSpaceOnUse">
						<stop offset="0" stop-color="#e02431" stop-opacity="0" />
						<stop offset="0.3" stop-color="#e02431" stop-opacity="1" />
						<stop offset="1" stop-color="#e02431" stop-opacity="1" />
					</linearGradient>
				</defs>
				<g>
					<path class="boot-strand boot-strand-a" d="M10,60 C12.1,59.7 18.2,57.9 22.3,58.2 C26.4,58.4 30.6,59.1 34.7,61.6 C38.8,64.1 42.9,70.7 47,73.3 C51.1,75.8 55.2,78.1 59.3,76.9 C63.4,75.7 67.6,70.5 71.7,66.2 C75.8,61.8 79.9,55 84,51 C88.1,47 92.2,43.1 96.3,42.3 C100.4,41.5 104.6,43.3 108.7,46.2 C112.8,49.2 116.9,55.4 121,60 C125.1,64.6 129.2,70.8 133.3,73.8 C137.4,76.7 141.6,78.5 145.7,77.7 C149.8,76.9 153.9,73 158,69 C162.1,65 166.2,58.2 170.3,53.8 C174.4,49.5 178.6,45.1 182.7,42.8 C186.8,40.5 190.9,40.3 195,40.3 C199.1,40.2 203.2,42.2 207.3,42.4 C211.4,42.6 215.6,41.9 219.7,41.4 C223.8,40.9 229.9,39.6 232,39.2" />
					<path class="boot-strand boot-strand-b" d="M10,60 C12.1,60.3 18.2,62.1 22.3,61.8 C26.4,61.6 30.6,60.9 34.7,58.4 C38.8,55.9 42.9,49.3 47,46.7 C51.1,44.2 55.2,41.9 59.3,43.1 C63.4,44.3 67.6,49.5 71.7,53.8 C75.8,58.2 79.9,65 84,69 C88.1,73 92.2,76.9 96.3,77.7 C100.4,78.5 104.6,76.7 108.7,73.8 C112.8,70.8 116.9,64.6 121,60 C125.1,55.4 129.2,49.2 133.3,46.2 C137.4,43.3 141.6,41.5 145.7,42.3 C149.8,43.1 153.9,47 158,51 C162.1,55 166.2,61.8 170.3,66.2 C174.4,70.5 178.6,74.9 182.7,77.2 C186.8,79.5 190.9,79.7 195,79.7 C199.1,79.8 203.2,77.8 207.3,77.6 C211.4,77.4 215.6,78.1 219.7,78.6 C223.8,79.1 229.9,80.4 232,80.8" />
					<polygon class="boot-arrowhead boot-arrowhead-a" points="0,-12 22,0 0,12" style="transform: translate(232px, 39.2px) rotate(-0.1deg)" />
					<polygon class="boot-arrowhead boot-arrowhead-b" points="0,-12 22,0 0,12" style="transform: translate(232px, 80.8px) rotate(0.1deg)" />
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
