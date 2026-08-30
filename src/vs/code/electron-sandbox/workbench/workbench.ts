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
				0%       { d: path("M10,60 C12.4,59.3 19.6,56 24.4,56 C29.2,56 34,57.5 38.8,60 C43.5,62.5 48.3,67.7 53.1,70.8 C57.9,73.8 62.7,77.8 67.5,78.3 C72.3,78.8 77.1,77.1 81.9,74 C86.7,71 91.5,64.5 96.2,60 C101,55.5 105.8,49.7 110.6,47.3 C115.4,44.8 120.2,44.3 125,45.2 C129.8,46.1 134.6,50.2 139.4,52.7 C144.2,55.2 149,59.2 153.8,60 C158.5,60.8 163.3,58.8 168.1,57.5 C172.9,56.1 177.7,54 182.5,51.9 C187.3,49.7 192.1,47.1 196.9,44.7 C201.7,42.3 206.5,39.7 211.2,37.6 C216,35.5 220.8,33.4 225.6,32.2 C230.4,30.9 237.6,30.4 240,30"); }
				12.5%    { d: path("M10,60 C12.4,59.1 19.6,55.6 24.4,54.3 C29.2,53 34,51.3 38.8,52.3 C43.5,53.2 48.3,56.6 53.1,60 C57.9,63.4 62.7,69.6 67.5,72.9 C72.3,76.2 77.1,79.7 81.9,79.8 C86.7,80 91.5,77.3 96.2,74 C101,70.7 105.8,64.1 110.6,60 C115.4,55.9 120.2,51.3 125,49.5 C129.8,47.8 134.6,48.5 139.4,49.7 C144.2,50.8 149,55.1 153.8,56.4 C158.5,57.7 163.3,58.3 168.1,57.5 C172.9,56.7 177.7,54 182.5,51.9 C187.3,49.7 192.1,47.1 196.9,44.7 C201.7,42.3 206.5,39.7 211.2,37.6 C216,35.5 220.8,33.4 225.6,32.2 C230.4,30.9 237.6,30.4 240,30"); }
				25%      { d: path("M10,60 C12.4,59.3 19.6,57.8 24.4,56 C29.2,54.2 34,50.2 38.8,49.1 C43.5,48 48.3,47.4 53.1,49.2 C57.9,51 62.7,55.9 67.5,60 C72.3,64.1 77.1,70.7 81.9,74 C86.7,77.3 91.5,80 96.2,79.7 C101,79.5 105.8,76 110.6,72.7 C115.4,69.4 120.2,63.3 125,60 C129.8,56.7 134.6,53.5 139.4,52.7 C144.2,51.9 149,54.2 153.8,55 C158.5,55.8 163.3,58 168.1,57.5 C172.9,57 177.7,54 182.5,51.9 C187.3,49.7 192.1,47.1 196.9,44.7 C201.7,42.3 206.5,39.7 211.2,37.6 C216,35.5 220.8,33.4 225.6,32.2 C230.4,30.9 237.6,30.4 240,30"); }
				37.5%    { d: path("M10,60 C12.4,60 19.6,61.3 24.4,60 C29.2,58.7 34,54.8 38.8,52.3 C43.5,49.7 48.3,45.6 53.1,44.8 C57.9,43.9 62.7,44.5 67.5,47.1 C72.3,49.6 77.1,55.5 81.9,60 C86.7,64.5 91.5,71 96.2,74 C101,77 105.8,78.6 110.6,78 C115.4,77.4 120.2,73.5 125,70.5 C129.8,67.5 134.6,62.3 139.4,60 C144.2,57.7 149,56.8 153.8,56.4 C158.5,56 163.3,58.3 168.1,57.5 C172.9,56.7 177.7,54 182.5,51.9 C187.3,49.7 192.1,47.1 196.9,44.7 C201.7,42.3 206.5,39.7 211.2,37.6 C216,35.5 220.8,33.4 225.6,32.2 C230.4,30.9 237.6,30.4 240,30"); }
				50%      { d: path("M10,60 C12.4,60.7 19.6,64 24.4,64 C29.2,64 34,62.5 38.8,60 C43.5,57.5 48.3,52.3 53.1,49.2 C57.9,46.2 62.7,42.2 67.5,41.7 C72.3,41.2 77.1,42.9 81.9,46 C86.7,49 91.5,55.5 96.2,60 C101,64.5 105.8,70.3 110.6,72.7 C115.4,75.2 120.2,75.7 125,74.8 C129.8,73.9 134.6,69.8 139.4,67.3 C144.2,64.8 149,61.6 153.8,60 C158.5,58.3 163.3,58.8 168.1,57.5 C172.9,56.1 177.7,54 182.5,51.9 C187.3,49.7 192.1,47.1 196.9,44.7 C201.7,42.3 206.5,39.7 211.2,37.6 C216,35.5 220.8,33.4 225.6,32.2 C230.4,30.9 237.6,30.4 240,30"); }
				62.5%    { d: path("M10,60 C12.4,60.9 19.6,64.4 24.4,65.7 C29.2,67 34,68.7 38.8,67.7 C43.5,66.8 48.3,63.4 53.1,60 C57.9,56.6 62.7,50.4 67.5,47.1 C72.3,43.8 77.1,40.3 81.9,40.2 C86.7,40 91.5,42.7 96.2,46 C101,49.3 105.8,55.9 110.6,60 C115.4,64.1 120.2,68.7 125,70.5 C129.8,72.2 134.6,71.5 139.4,70.3 C144.2,69.2 149,65.7 153.8,63.5 C158.5,61.4 163.3,59.4 168.1,57.5 C172.9,55.6 177.7,54 182.5,51.9 C187.3,49.7 192.1,47.1 196.9,44.7 C201.7,42.3 206.5,39.7 211.2,37.6 C216,35.5 220.8,33.4 225.6,32.2 C230.4,30.9 237.6,30.4 240,30"); }
				75%      { d: path("M10,60 C12.4,60.7 19.6,62.2 24.4,64 C29.2,65.8 34,69.8 38.8,70.9 C43.5,72 48.3,72.6 53.1,70.8 C57.9,69 62.7,64.1 67.5,60 C72.3,55.9 77.1,49.3 81.9,46 C86.7,42.7 91.5,40 96.2,40.3 C101,40.5 105.8,44 110.6,47.3 C115.4,50.6 120.2,56.7 125,60 C129.8,63.3 134.6,66.5 139.4,67.3 C144.2,68.1 149,66.6 153.8,65 C158.5,63.4 163.3,59.7 168.1,57.5 C172.9,55.3 177.7,54 182.5,51.9 C187.3,49.7 192.1,47.1 196.9,44.7 C201.7,42.3 206.5,39.7 211.2,37.6 C216,35.5 220.8,33.4 225.6,32.2 C230.4,30.9 237.6,30.4 240,30"); }
				87.5%    { d: path("M10,60 C12.4,60 19.6,58.7 24.4,60 C29.2,61.3 34,65.2 38.8,67.7 C43.5,70.3 48.3,74.4 53.1,75.2 C57.9,76.1 62.7,75.5 67.5,72.9 C72.3,70.4 77.1,64.5 81.9,60 C86.7,55.5 91.5,49 96.2,46 C101,43 105.8,41.4 110.6,42 C115.4,42.6 120.2,46.5 125,49.5 C129.8,52.5 134.6,57.7 139.4,60 C144.2,62.3 149,64 153.8,63.5 C158.5,63.1 163.3,59.4 168.1,57.5 C172.9,55.6 177.7,54 182.5,51.9 C187.3,49.7 192.1,47.1 196.9,44.7 C201.7,42.3 206.5,39.7 211.2,37.6 C216,35.5 220.8,33.4 225.6,32.2 C230.4,30.9 237.6,30.4 240,30"); }
				100%     { d: path("M10,60 C12.4,59.3 19.6,56 24.4,56 C29.2,56 34,57.5 38.8,60 C43.5,62.5 48.3,67.7 53.1,70.8 C57.9,73.8 62.7,77.8 67.5,78.3 C72.3,78.8 77.1,77.1 81.9,74 C86.7,71 91.5,64.5 96.2,60 C101,55.5 105.8,49.7 110.6,47.3 C115.4,44.8 120.2,44.3 125,45.2 C129.8,46.1 134.6,50.2 139.4,52.7 C144.2,55.2 149,59.2 153.8,60 C158.5,60.8 163.3,58.8 168.1,57.5 C172.9,56.1 177.7,54 182.5,51.9 C187.3,49.7 192.1,47.1 196.9,44.7 C201.7,42.3 206.5,39.7 211.2,37.6 C216,35.5 220.8,33.4 225.6,32.2 C230.4,30.9 237.6,30.4 240,30"); }
			}
			@keyframes monaco-workbench-splash-wave-b {
				0%       { d: path("M10,60 C12.4,60.7 19.6,64 24.4,64 C29.2,64 34,62.5 38.8,60 C43.5,57.5 48.3,52.3 53.1,49.2 C57.9,46.2 62.7,42.2 67.5,41.7 C72.3,41.2 77.1,42.9 81.9,46 C86.7,49 91.5,55.5 96.2,60 C101,64.5 105.8,70.3 110.6,72.7 C115.4,75.2 120.2,75.7 125,74.8 C129.8,73.9 134.6,69.8 139.4,67.3 C144.2,64.8 149,60.8 153.8,60 C158.5,59.2 163.3,61.2 168.1,62.5 C172.9,63.9 177.7,66 182.5,68.1 C187.3,70.3 192.1,72.9 196.9,75.3 C201.7,77.7 206.5,80.3 211.2,82.4 C216,84.5 220.8,86.6 225.6,87.8 C230.4,89.1 237.6,89.6 240,90"); }
				12.5%    { d: path("M10,60 C12.4,60.9 19.6,64.4 24.4,65.7 C29.2,67 34,68.7 38.8,67.7 C43.5,66.8 48.3,63.4 53.1,60 C57.9,56.6 62.7,50.4 67.5,47.1 C72.3,43.8 77.1,40.3 81.9,40.2 C86.7,40 91.5,42.7 96.2,46 C101,49.3 105.8,55.9 110.6,60 C115.4,64.1 120.2,68.7 125,70.5 C129.8,72.2 134.6,71.5 139.4,70.3 C144.2,69.2 149,64.9 153.8,63.6 C158.5,62.3 163.3,61.7 168.1,62.5 C172.9,63.3 177.7,66 182.5,68.1 C187.3,70.3 192.1,72.9 196.9,75.3 C201.7,77.7 206.5,80.3 211.2,82.4 C216,84.5 220.8,86.6 225.6,87.8 C230.4,89.1 237.6,89.6 240,90"); }
				25%      { d: path("M10,60 C12.4,60.7 19.6,62.2 24.4,64 C29.2,65.8 34,69.8 38.8,70.9 C43.5,72 48.3,72.6 53.1,70.8 C57.9,69 62.7,64.1 67.5,60 C72.3,55.9 77.1,49.3 81.9,46 C86.7,42.7 91.5,40 96.2,40.3 C101,40.5 105.8,44 110.6,47.3 C115.4,50.6 120.2,56.7 125,60 C129.8,63.3 134.6,66.5 139.4,67.3 C144.2,68.1 149,65.8 153.8,65 C158.5,64.2 163.3,62 168.1,62.5 C172.9,63 177.7,66 182.5,68.1 C187.3,70.3 192.1,72.9 196.9,75.3 C201.7,77.7 206.5,80.3 211.2,82.4 C216,84.5 220.8,86.6 225.6,87.8 C230.4,89.1 237.6,89.6 240,90"); }
				37.5%    { d: path("M10,60 C12.4,60 19.6,58.7 24.4,60 C29.2,61.3 34,65.2 38.8,67.7 C43.5,70.3 48.3,74.4 53.1,75.2 C57.9,76.1 62.7,75.5 67.5,72.9 C72.3,70.4 77.1,64.5 81.9,60 C86.7,55.5 91.5,49 96.2,46 C101,43 105.8,41.4 110.6,42 C115.4,42.6 120.2,46.5 125,49.5 C129.8,52.5 134.6,57.7 139.4,60 C144.2,62.3 149,63.2 153.8,63.6 C158.5,64 163.3,61.7 168.1,62.5 C172.9,63.3 177.7,66 182.5,68.1 C187.3,70.3 192.1,72.9 196.9,75.3 C201.7,77.7 206.5,80.3 211.2,82.4 C216,84.5 220.8,86.6 225.6,87.8 C230.4,89.1 237.6,89.6 240,90"); }
				50%      { d: path("M10,60 C12.4,59.3 19.6,56 24.4,56 C29.2,56 34,57.5 38.8,60 C43.5,62.5 48.3,67.7 53.1,70.8 C57.9,73.8 62.7,77.8 67.5,78.3 C72.3,78.8 77.1,77.1 81.9,74 C86.7,71 91.5,64.5 96.2,60 C101,55.5 105.8,49.7 110.6,47.3 C115.4,44.8 120.2,44.3 125,45.2 C129.8,46.1 134.6,50.2 139.4,52.7 C144.2,55.2 149,58.4 153.8,60 C158.5,61.7 163.3,61.2 168.1,62.5 C172.9,63.9 177.7,66 182.5,68.1 C187.3,70.3 192.1,72.9 196.9,75.3 C201.7,77.7 206.5,80.3 211.2,82.4 C216,84.5 220.8,86.6 225.6,87.8 C230.4,89.1 237.6,89.6 240,90"); }
				62.5%    { d: path("M10,60 C12.4,59.1 19.6,55.6 24.4,54.3 C29.2,53 34,51.3 38.8,52.3 C43.5,53.2 48.3,56.6 53.1,60 C57.9,63.4 62.7,69.6 67.5,72.9 C72.3,76.2 77.1,79.7 81.9,79.8 C86.7,80 91.5,77.3 96.2,74 C101,70.7 105.8,64.1 110.6,60 C115.4,55.9 120.2,51.3 125,49.5 C129.8,47.8 134.6,48.5 139.4,49.7 C144.2,50.8 149,54.3 153.8,56.5 C158.5,58.6 163.3,60.6 168.1,62.5 C172.9,64.4 177.7,66 182.5,68.1 C187.3,70.3 192.1,72.9 196.9,75.3 C201.7,77.7 206.5,80.3 211.2,82.4 C216,84.5 220.8,86.6 225.6,87.8 C230.4,89.1 237.6,89.6 240,90"); }
				75%      { d: path("M10,60 C12.4,59.3 19.6,57.8 24.4,56 C29.2,54.2 34,50.2 38.8,49.1 C43.5,48 48.3,47.4 53.1,49.2 C57.9,51 62.7,55.9 67.5,60 C72.3,64.1 77.1,70.7 81.9,74 C86.7,77.3 91.5,80 96.2,79.7 C101,79.5 105.8,76 110.6,72.7 C115.4,69.4 120.2,63.3 125,60 C129.8,56.7 134.6,53.5 139.4,52.7 C144.2,51.9 149,53.4 153.8,55 C158.5,56.6 163.3,60.3 168.1,62.5 C172.9,64.7 177.7,66 182.5,68.1 C187.3,70.3 192.1,72.9 196.9,75.3 C201.7,77.7 206.5,80.3 211.2,82.4 C216,84.5 220.8,86.6 225.6,87.8 C230.4,89.1 237.6,89.6 240,90"); }
				87.5%    { d: path("M10,60 C12.4,60 19.6,61.3 24.4,60 C29.2,58.7 34,54.8 38.8,52.3 C43.5,49.7 48.3,45.6 53.1,44.8 C57.9,43.9 62.7,44.5 67.5,47.1 C72.3,49.6 77.1,55.5 81.9,60 C86.7,64.5 91.5,71 96.2,74 C101,77 105.8,78.6 110.6,78 C115.4,77.4 120.2,73.5 125,70.5 C129.8,67.5 134.6,62.3 139.4,60 C144.2,57.7 149,56 153.8,56.5 C158.5,56.9 163.3,60.6 168.1,62.5 C172.9,64.4 177.7,66 182.5,68.1 C187.3,70.3 192.1,72.9 196.9,75.3 C201.7,77.7 206.5,80.3 211.2,82.4 C216,84.5 220.8,86.6 225.6,87.8 C230.4,89.1 237.6,89.6 240,90"); }
				100%     { d: path("M10,60 C12.4,60.7 19.6,64 24.4,64 C29.2,64 34,62.5 38.8,60 C43.5,57.5 48.3,52.3 53.1,49.2 C57.9,46.2 62.7,42.2 67.5,41.7 C72.3,41.2 77.1,42.9 81.9,46 C86.7,49 91.5,55.5 96.2,60 C101,64.5 105.8,70.3 110.6,72.7 C115.4,75.2 120.2,75.7 125,74.8 C129.8,73.9 134.6,69.8 139.4,67.3 C144.2,64.8 149,60.8 153.8,60 C158.5,59.2 163.3,61.2 168.1,62.5 C172.9,63.9 177.7,66 182.5,68.1 C187.3,70.3 192.1,72.9 196.9,75.3 C201.7,77.7 206.5,80.3 211.2,82.4 C216,84.5 220.8,86.6 225.6,87.8 C230.4,89.1 237.6,89.6 240,90"); }
			}
			@media (prefers-reduced-motion: reduce) { #monaco-workbench-splash-logo .boot-strand-a, #monaco-workbench-splash-logo .boot-strand-b { animation: none; } }
		`;

		// Orchestra: two strands weaving around a centre line before fanning out into a
		// pair of arrows, the weave travelling left to right while the workbench boots;
		// removed with the color/layout splash on first layout (see PartsSplash).
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
					<path class="boot-strand boot-strand-a" d="M10,60 C12.4,59.3 19.6,56 24.4,56 C29.2,56 34,57.5 38.8,60 C43.5,62.5 48.3,67.7 53.1,70.8 C57.9,73.8 62.7,77.8 67.5,78.3 C72.3,78.8 77.1,77.1 81.9,74 C86.7,71 91.5,64.5 96.2,60 C101,55.5 105.8,49.7 110.6,47.3 C115.4,44.8 120.2,44.3 125,45.2 C129.8,46.1 134.6,50.2 139.4,52.7 C144.2,55.2 149,59.2 153.8,60 C158.5,60.8 163.3,58.8 168.1,57.5 C172.9,56.1 177.7,54 182.5,51.9 C187.3,49.7 192.1,47.1 196.9,44.7 C201.7,42.3 206.5,39.7 211.2,37.6 C216,35.5 220.8,33.4 225.6,32.2 C230.4,30.9 237.6,30.4 240,30" />
					<path class="boot-strand boot-strand-b" d="M10,60 C12.4,60.7 19.6,64 24.4,64 C29.2,64 34,62.5 38.8,60 C43.5,57.5 48.3,52.3 53.1,49.2 C57.9,46.2 62.7,42.2 67.5,41.7 C72.3,41.2 77.1,42.9 81.9,46 C86.7,49 91.5,55.5 96.2,60 C101,64.5 105.8,70.3 110.6,72.7 C115.4,75.2 120.2,75.7 125,74.8 C129.8,73.9 134.6,69.8 139.4,67.3 C144.2,64.8 149,60.8 153.8,60 C158.5,59.2 163.3,61.2 168.1,62.5 C172.9,63.9 177.7,66 182.5,68.1 C187.3,70.3 192.1,72.9 196.9,75.3 C201.7,77.7 206.5,80.3 211.2,82.4 C216,84.5 220.8,86.6 225.6,87.8 C230.4,89.1 237.6,89.6 240,90" />
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
