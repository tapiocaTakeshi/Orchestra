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
			#monaco-workbench-splash-logo .boot-arrowhead { fill: #e02431; stroke: none; }
			#monaco-workbench-splash-logo .boot-strand-a { animation: monaco-workbench-splash-wave-a 3.2s linear infinite; }
			#monaco-workbench-splash-logo .boot-strand-b { animation: monaco-workbench-splash-wave-b 3.2s linear infinite; }
			@keyframes monaco-workbench-splash-wave-a {
				0%       { d: path("M10,60 C12.1,59.7 18.5,57.9 22.8,58.2 C27,58.4 31.3,59.1 35.6,61.6 C39.8,64.1 44.1,70.7 48.3,73.3 C52.6,75.8 56.9,78.1 61.1,76.9 C65.4,75.7 69.6,70.5 73.9,66.2 C78.1,61.8 82.4,55 86.7,51 C90.9,47 95.2,43.1 99.4,42.3 C103.7,41.5 108,43.3 112.2,46.2 C116.5,49.2 120.7,55.4 125,60 C129.3,64.6 133.5,70.8 137.8,73.8 C142,76.7 146.3,78.5 150.6,77.7 C154.8,76.9 159.1,73 163.3,69 C167.6,65 171.9,58.2 176.1,53.8 C180.4,49.5 184.6,44.9 188.9,42.9 C193.1,40.9 197.4,41.6 201.7,41.6 C205.9,41.7 210.2,43.8 214.4,43.1 C218.7,42.3 223,39.2 227.2,37.4 C231.5,35.5 237.9,32.9 240,32"); }
				12.5%    { d: path("M10,60 C12.1,59.5 18.5,58 22.8,57.1 C27,56.3 31.3,53.6 35.6,54.8 C39.8,55.9 44.1,60.4 48.3,64 C52.6,67.6 56.9,74.3 61.1,76.3 C65.4,78.4 69.6,78.3 73.9,76.3 C78.1,74.4 82.4,69.1 86.7,64.7 C90.9,60.2 95.2,53.4 99.4,49.7 C103.7,45.9 108,42.5 112.2,42.1 C116.5,41.7 120.7,44 125,47.3 C129.3,50.5 133.5,57 137.8,61.6 C142,66.1 146.3,72.1 150.6,74.7 C154.8,77.4 159.1,78.6 163.3,77.4 C167.6,76.2 171.9,71.8 176.1,67.6 C180.4,63.4 184.6,56.6 188.9,52.1 C193.1,47.5 197.4,42.6 201.7,40.2 C205.9,37.9 210.2,38.7 214.4,37.9 C218.7,37.1 223,36.6 227.2,35.6 C231.5,34.6 237.9,32.6 240,32"); }
				25%      { d: path("M10,60 C12.1,59.6 18.5,59.3 22.8,57.8 C27,56.3 31.3,51.9 35.6,51 C39.8,50.1 44.1,49.8 48.3,52.3 C52.6,54.9 56.9,62.1 61.1,66.2 C65.4,70.3 69.6,75.3 73.9,76.9 C78.1,78.5 82.4,77.9 86.7,75.6 C90.9,73.3 95.2,67.7 99.4,63.1 C103.7,58.6 108,52 112.2,48.4 C116.5,44.9 120.7,42 125,42 C129.3,42 133.5,44.9 137.8,48.4 C142,52 146.3,58.6 150.6,63.1 C154.8,67.7 159.1,73.3 163.3,75.6 C167.6,77.9 171.9,78.6 176.1,76.9 C180.4,75.3 184.6,70.6 188.9,65.6 C193.1,60.6 197.4,51.6 201.7,46.8 C205.9,41.9 210.2,38.7 214.4,36.6 C218.7,34.4 223,34.7 227.2,33.9 C231.5,33.2 237.9,32.3 240,32"); }
				37.5%    { d: path("M10,60 C12.1,60 18.5,61 22.8,59.8 C27,58.5 31.3,54.9 35.6,52.5 C39.8,50.1 44.1,45.2 48.3,45.2 C52.6,45.2 56.9,48.7 61.1,52.4 C65.4,56.1 69.6,63.4 73.9,67.6 C78.1,71.8 82.4,76.2 86.7,77.4 C90.9,78.6 95.2,77.4 99.4,74.7 C103.7,72.1 108,66.1 112.2,61.6 C116.5,57 120.7,50.5 125,47.3 C129.3,44 133.5,41.7 137.8,42.1 C142,42.5 146.3,45.9 150.6,49.7 C154.8,53.4 159.1,60.2 163.3,64.7 C167.6,69.1 171.9,74.5 176.1,76.3 C180.4,78.1 184.6,78.8 188.9,75.6 C193.1,72.5 197.4,63.3 201.7,57.4 C205.9,51.4 210.2,43.9 214.4,39.9 C218.7,35.9 223,34.7 227.2,33.4 C231.5,32.1 237.9,32.2 240,32"); }
				50%      { d: path("M10,60 C12.1,60.3 18.5,62.1 22.8,61.8 C27,61.6 31.3,60.9 35.6,58.4 C39.8,55.9 44.1,49.3 48.3,46.7 C52.6,44.2 56.9,41.9 61.1,43.1 C65.4,44.3 69.6,49.5 73.9,53.8 C78.1,58.2 82.4,65 86.7,69 C90.9,73 95.2,76.9 99.4,77.7 C103.7,78.5 108,76.7 112.2,73.8 C116.5,70.8 120.7,64.6 125,60 C129.3,55.4 133.5,49.2 137.8,46.2 C142,43.3 146.3,41.5 150.6,42.3 C154.8,43.1 159.1,47 163.3,51 C167.6,55 171.9,62 176.1,66.2 C180.4,70.4 184.6,76.3 188.9,76.2 C193.1,76.2 197.4,70.9 201.7,65.9 C205.9,60.8 210.2,51.1 214.4,45.8 C218.7,40.6 223,36.5 227.2,34.2 C231.5,31.9 237.9,32.4 240,32"); }
				62.5%    { d: path("M10,60 C12.1,60.5 18.5,62 22.8,62.9 C27,63.7 31.3,66.4 35.6,65.2 C39.8,64.1 44.1,59.6 48.3,56 C52.6,52.4 56.9,45.7 61.1,43.7 C65.4,41.6 69.6,41.7 73.9,43.7 C78.1,45.6 82.4,50.9 86.7,55.3 C90.9,59.8 95.2,66.6 99.4,70.3 C103.7,74.1 108,77.5 112.2,77.9 C116.5,78.3 120.7,76 125,72.7 C129.3,69.5 133.5,63 137.8,58.4 C142,53.9 146.3,47.9 150.6,45.3 C154.8,42.6 159.1,41.4 163.3,42.6 C167.6,43.8 171.9,48.3 176.1,52.4 C180.4,56.5 184.6,64.6 188.9,67 C193.1,69.5 197.4,69.9 201.7,67.3 C205.9,64.6 210.2,56.2 214.4,51 C218.7,45.8 223,39.2 227.2,36 C231.5,32.9 237.9,32.7 240,32"); }
				75%      { d: path("M10,60 C12.1,60.4 18.5,60.7 22.8,62.2 C27,63.7 31.3,68.1 35.6,69 C39.8,69.9 44.1,70.2 48.3,67.7 C52.6,65.1 56.9,57.9 61.1,53.8 C65.4,49.7 69.6,44.7 73.9,43.1 C78.1,41.5 82.4,42.1 86.7,44.4 C90.9,46.7 95.2,52.3 99.4,56.9 C103.7,61.4 108,68 112.2,71.6 C116.5,75.1 120.7,78 125,78 C129.3,78 133.5,75.1 137.8,71.6 C142,68 146.3,61.4 150.6,56.9 C154.8,52.3 159.1,46.7 163.3,44.4 C167.6,42.1 171.9,41.6 176.1,43.1 C180.4,44.6 184.6,50.6 188.9,53.5 C193.1,56.4 197.4,60.9 201.7,60.7 C205.9,60.6 210.2,56.2 214.4,52.3 C218.7,48.5 223,41.1 227.2,37.7 C231.5,34.3 237.9,32.9 240,32"); }
				87.5%    { d: path("M10,60 C12.1,60 18.5,59 22.8,60.2 C27,61.5 31.3,65.1 35.6,67.5 C39.8,69.9 44.1,74.8 48.3,74.8 C52.6,74.8 56.9,71.3 61.1,67.6 C65.4,63.9 69.6,56.6 73.9,52.4 C78.1,48.2 82.4,43.8 86.7,42.6 C90.9,41.4 95.2,42.6 99.4,45.3 C103.7,47.9 108,53.9 112.2,58.4 C116.5,63 120.7,69.5 125,72.7 C129.3,76 133.5,78.3 137.8,77.9 C142,77.5 146.3,74.1 150.6,70.3 C154.8,66.6 159.1,59.8 163.3,55.3 C167.6,50.9 171.9,45.7 176.1,43.7 C180.4,41.7 184.6,42.4 188.9,43.5 C193.1,44.6 197.4,49.2 201.7,50.1 C205.9,51.1 210.2,51 214.4,49 C218.7,47.1 223,41.1 227.2,38.2 C231.5,35.4 237.9,33 240,32"); }
				100%     { d: path("M10,60 C12.1,59.7 18.5,57.9 22.8,58.2 C27,58.4 31.3,59.1 35.6,61.6 C39.8,64.1 44.1,70.7 48.3,73.3 C52.6,75.8 56.9,78.1 61.1,76.9 C65.4,75.7 69.6,70.5 73.9,66.2 C78.1,61.8 82.4,55 86.7,51 C90.9,47 95.2,43.1 99.4,42.3 C103.7,41.5 108,43.3 112.2,46.2 C116.5,49.2 120.7,55.4 125,60 C129.3,64.6 133.5,70.8 137.8,73.8 C142,76.7 146.3,78.5 150.6,77.7 C154.8,76.9 159.1,73 163.3,69 C167.6,65 171.9,58.2 176.1,53.8 C180.4,49.5 184.6,44.9 188.9,42.9 C193.1,40.9 197.4,41.6 201.7,41.6 C205.9,41.7 210.2,43.8 214.4,43.1 C218.7,42.3 223,39.2 227.2,37.4 C231.5,35.5 237.9,32.9 240,32"); }
			}
			@keyframes monaco-workbench-splash-wave-b {
				0%       { d: path("M10,60 C12.1,60.3 18.5,62.1 22.8,61.8 C27,61.6 31.3,60.9 35.6,58.4 C39.8,55.9 44.1,49.3 48.3,46.7 C52.6,44.2 56.9,41.9 61.1,43.1 C65.4,44.3 69.6,49.5 73.9,53.8 C78.1,58.2 82.4,65 86.7,69 C90.9,73 95.2,76.9 99.4,77.7 C103.7,78.5 108,76.7 112.2,73.8 C116.5,70.8 120.7,64.6 125,60 C129.3,55.4 133.5,49.2 137.8,46.2 C142,43.3 146.3,41.5 150.6,42.3 C154.8,43.1 159.1,47 163.3,51 C167.6,55 171.9,61.8 176.1,66.2 C180.4,70.5 184.6,75.1 188.9,77.1 C193.1,79.1 197.4,78.4 201.7,78.4 C205.9,78.3 210.2,76.2 214.4,76.9 C218.7,77.7 223,80.8 227.2,82.6 C231.5,84.5 237.9,87.1 240,88"); }
				12.5%    { d: path("M10,60 C12.1,60.5 18.5,62 22.8,62.9 C27,63.7 31.3,66.4 35.6,65.2 C39.8,64.1 44.1,59.6 48.3,56 C52.6,52.4 56.9,45.7 61.1,43.7 C65.4,41.6 69.6,41.7 73.9,43.7 C78.1,45.6 82.4,50.9 86.7,55.3 C90.9,59.8 95.2,66.6 99.4,70.3 C103.7,74.1 108,77.5 112.2,77.9 C116.5,78.3 120.7,76 125,72.7 C129.3,69.5 133.5,63 137.8,58.4 C142,53.9 146.3,47.9 150.6,45.3 C154.8,42.6 159.1,41.4 163.3,42.6 C167.6,43.8 171.9,48.2 176.1,52.4 C180.4,56.6 184.6,63.4 188.9,67.9 C193.1,72.5 197.4,77.4 201.7,79.8 C205.9,82.1 210.2,81.3 214.4,82.1 C218.7,82.9 223,83.4 227.2,84.4 C231.5,85.4 237.9,87.4 240,88"); }
				25%      { d: path("M10,60 C12.1,60.4 18.5,60.7 22.8,62.2 C27,63.7 31.3,68.1 35.6,69 C39.8,69.9 44.1,70.2 48.3,67.7 C52.6,65.1 56.9,57.9 61.1,53.8 C65.4,49.7 69.6,44.7 73.9,43.1 C78.1,41.5 82.4,42.1 86.7,44.4 C90.9,46.7 95.2,52.3 99.4,56.9 C103.7,61.4 108,68 112.2,71.6 C116.5,75.1 120.7,78 125,78 C129.3,78 133.5,75.1 137.8,71.6 C142,68 146.3,61.4 150.6,56.9 C154.8,52.3 159.1,46.7 163.3,44.4 C167.6,42.1 171.9,41.4 176.1,43.1 C180.4,44.7 184.6,49.4 188.9,54.4 C193.1,59.4 197.4,68.4 201.7,73.2 C205.9,78.1 210.2,81.3 214.4,83.4 C218.7,85.6 223,85.3 227.2,86.1 C231.5,86.8 237.9,87.7 240,88"); }
				37.5%    { d: path("M10,60 C12.1,60 18.5,59 22.8,60.2 C27,61.5 31.3,65.1 35.6,67.5 C39.8,69.9 44.1,74.8 48.3,74.8 C52.6,74.8 56.9,71.3 61.1,67.6 C65.4,63.9 69.6,56.6 73.9,52.4 C78.1,48.2 82.4,43.8 86.7,42.6 C90.9,41.4 95.2,42.6 99.4,45.3 C103.7,47.9 108,53.9 112.2,58.4 C116.5,63 120.7,69.5 125,72.7 C129.3,76 133.5,78.3 137.8,77.9 C142,77.5 146.3,74.1 150.6,70.3 C154.8,66.6 159.1,59.8 163.3,55.3 C167.6,50.9 171.9,45.5 176.1,43.7 C180.4,41.9 184.6,41.2 188.9,44.4 C193.1,47.5 197.4,56.7 201.7,62.6 C205.9,68.6 210.2,76.1 214.4,80.1 C218.7,84.1 223,85.3 227.2,86.6 C231.5,87.9 237.9,87.8 240,88"); }
				50%      { d: path("M10,60 C12.1,59.7 18.5,57.9 22.8,58.2 C27,58.4 31.3,59.1 35.6,61.6 C39.8,64.1 44.1,70.7 48.3,73.3 C52.6,75.8 56.9,78.1 61.1,76.9 C65.4,75.7 69.6,70.5 73.9,66.2 C78.1,61.8 82.4,55 86.7,51 C90.9,47 95.2,43.1 99.4,42.3 C103.7,41.5 108,43.3 112.2,46.2 C116.5,49.2 120.7,55.4 125,60 C129.3,64.6 133.5,70.8 137.8,73.8 C142,76.7 146.3,78.5 150.6,77.7 C154.8,76.9 159.1,73 163.3,69 C167.6,65 171.9,58 176.1,53.8 C180.4,49.6 184.6,43.7 188.9,43.8 C193.1,43.8 197.4,49.1 201.7,54.1 C205.9,59.2 210.2,68.9 214.4,74.2 C218.7,79.4 223,83.5 227.2,85.8 C231.5,88.1 237.9,87.6 240,88"); }
				62.5%    { d: path("M10,60 C12.1,59.5 18.5,58 22.8,57.1 C27,56.3 31.3,53.6 35.6,54.8 C39.8,55.9 44.1,60.4 48.3,64 C52.6,67.6 56.9,74.3 61.1,76.3 C65.4,78.4 69.6,78.3 73.9,76.3 C78.1,74.4 82.4,69.1 86.7,64.7 C90.9,60.2 95.2,53.4 99.4,49.7 C103.7,45.9 108,42.5 112.2,42.1 C116.5,41.7 120.7,44 125,47.3 C129.3,50.5 133.5,57 137.8,61.6 C142,66.1 146.3,72.1 150.6,74.7 C154.8,77.4 159.1,78.6 163.3,77.4 C167.6,76.2 171.9,71.7 176.1,67.6 C180.4,63.5 184.6,55.4 188.9,53 C193.1,50.5 197.4,50.1 201.7,52.7 C205.9,55.4 210.2,63.8 214.4,69 C218.7,74.2 223,80.8 227.2,84 C231.5,87.1 237.9,87.3 240,88"); }
				75%      { d: path("M10,60 C12.1,59.6 18.5,59.3 22.8,57.8 C27,56.3 31.3,51.9 35.6,51 C39.8,50.1 44.1,49.8 48.3,52.3 C52.6,54.9 56.9,62.1 61.1,66.2 C65.4,70.3 69.6,75.3 73.9,76.9 C78.1,78.5 82.4,77.9 86.7,75.6 C90.9,73.3 95.2,67.7 99.4,63.1 C103.7,58.6 108,52 112.2,48.4 C116.5,44.9 120.7,42 125,42 C129.3,42 133.5,44.9 137.8,48.4 C142,52 146.3,58.6 150.6,63.1 C154.8,67.7 159.1,73.3 163.3,75.6 C167.6,77.9 171.9,78.4 176.1,76.9 C180.4,75.4 184.6,69.4 188.9,66.5 C193.1,63.6 197.4,59.1 201.7,59.3 C205.9,59.4 210.2,63.8 214.4,67.7 C218.7,71.5 223,78.9 227.2,82.3 C231.5,85.7 237.9,87.1 240,88"); }
				87.5%    { d: path("M10,60 C12.1,60 18.5,61 22.8,59.8 C27,58.5 31.3,54.9 35.6,52.5 C39.8,50.1 44.1,45.2 48.3,45.2 C52.6,45.2 56.9,48.7 61.1,52.4 C65.4,56.1 69.6,63.4 73.9,67.6 C78.1,71.8 82.4,76.2 86.7,77.4 C90.9,78.6 95.2,77.4 99.4,74.7 C103.7,72.1 108,66.1 112.2,61.6 C116.5,57 120.7,50.5 125,47.3 C129.3,44 133.5,41.7 137.8,42.1 C142,42.5 146.3,45.9 150.6,49.7 C154.8,53.4 159.1,60.2 163.3,64.7 C167.6,69.1 171.9,74.3 176.1,76.3 C180.4,78.3 184.6,77.6 188.9,76.5 C193.1,75.4 197.4,70.8 201.7,69.9 C205.9,68.9 210.2,69 214.4,71 C218.7,72.9 223,78.9 227.2,81.8 C231.5,84.6 237.9,87 240,88"); }
				100%     { d: path("M10,60 C12.1,60.3 18.5,62.1 22.8,61.8 C27,61.6 31.3,60.9 35.6,58.4 C39.8,55.9 44.1,49.3 48.3,46.7 C52.6,44.2 56.9,41.9 61.1,43.1 C65.4,44.3 69.6,49.5 73.9,53.8 C78.1,58.2 82.4,65 86.7,69 C90.9,73 95.2,76.9 99.4,77.7 C103.7,78.5 108,76.7 112.2,73.8 C116.5,70.8 120.7,64.6 125,60 C129.3,55.4 133.5,49.2 137.8,46.2 C142,43.3 146.3,41.5 150.6,42.3 C154.8,43.1 159.1,47 163.3,51 C167.6,55 171.9,61.8 176.1,66.2 C180.4,70.5 184.6,75.1 188.9,77.1 C193.1,79.1 197.4,78.4 201.7,78.4 C205.9,78.3 210.2,76.2 214.4,76.9 C218.7,77.7 223,80.8 227.2,82.6 C231.5,84.5 237.9,87.1 240,88"); }
			}
			@media (prefers-reduced-motion: reduce) { #monaco-workbench-splash-logo .boot-strand-a, #monaco-workbench-splash-logo .boot-strand-b { animation: none; } }
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
					<path class="boot-strand boot-strand-a" d="M10,60 C12.1,59.7 18.5,57.9 22.8,58.2 C27,58.4 31.3,59.1 35.6,61.6 C39.8,64.1 44.1,70.7 48.3,73.3 C52.6,75.8 56.9,78.1 61.1,76.9 C65.4,75.7 69.6,70.5 73.9,66.2 C78.1,61.8 82.4,55 86.7,51 C90.9,47 95.2,43.1 99.4,42.3 C103.7,41.5 108,43.3 112.2,46.2 C116.5,49.2 120.7,55.4 125,60 C129.3,64.6 133.5,70.8 137.8,73.8 C142,76.7 146.3,78.5 150.6,77.7 C154.8,76.9 159.1,73 163.3,69 C167.6,65 171.9,58.2 176.1,53.8 C180.4,49.5 184.6,44.9 188.9,42.9 C193.1,40.9 197.4,41.6 201.7,41.6 C205.9,41.7 210.2,43.8 214.4,43.1 C218.7,42.3 223,39.2 227.2,37.4 C231.5,35.5 237.9,32.9 240,32" />
					<path class="boot-strand boot-strand-b" d="M10,60 C12.1,60.3 18.5,62.1 22.8,61.8 C27,61.6 31.3,60.9 35.6,58.4 C39.8,55.9 44.1,49.3 48.3,46.7 C52.6,44.2 56.9,41.9 61.1,43.1 C65.4,44.3 69.6,49.5 73.9,53.8 C78.1,58.2 82.4,65 86.7,69 C90.9,73 95.2,76.9 99.4,77.7 C103.7,78.5 108,76.7 112.2,73.8 C116.5,70.8 120.7,64.6 125,60 C129.3,55.4 133.5,49.2 137.8,46.2 C142,43.3 146.3,41.5 150.6,42.3 C154.8,43.1 159.1,47 163.3,51 C167.6,55 171.9,61.8 176.1,66.2 C180.4,70.5 184.6,75.1 188.9,77.1 C193.1,79.1 197.4,78.4 201.7,78.4 C205.9,78.3 210.2,76.2 214.4,76.9 C218.7,77.7 223,80.8 227.2,82.6 C231.5,84.5 237.9,87.1 240,88" />
					<polygon class="boot-arrowhead" points="234,67 272,88 234,109" />
					<polygon class="boot-arrowhead" points="234,11 272,32 234,53" />
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
