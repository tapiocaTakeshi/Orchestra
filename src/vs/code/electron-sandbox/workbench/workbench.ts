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
			#monaco-workbench-splash-logo .boot-strand, #monaco-workbench-splash-logo .boot-arrowhead { fill: none; stroke: #e02431; stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
			#monaco-workbench-splash-logo .boot-strand-a { animation: monaco-workbench-splash-wave-a 2.6s ease-in-out infinite; }
			#monaco-workbench-splash-logo .boot-strand-b { animation: monaco-workbench-splash-wave-b 2.6s ease-in-out infinite; }
			@keyframes monaco-workbench-splash-wave-a { 0%, 100% { d: path("M10,30 C60,20 90,40 130,60 C170,80 200,100 240,90"); } 50% { d: path("M10,30 C60,45 90,55 130,60 C170,65 200,75 240,90"); } }
			@keyframes monaco-workbench-splash-wave-b { 0%, 100% { d: path("M10,90 C60,100 90,80 130,60 C170,40 200,20 240,30"); } 50% { d: path("M10,90 C60,75 90,65 130,60 C170,55 200,45 240,30"); } }
			@media (prefers-reduced-motion: reduce) { #monaco-workbench-splash-logo .boot-strand-a, #monaco-workbench-splash-logo .boot-strand-b { animation: none; } }
		`;

		// Orchestra: two crossing wave arrows shown centered over the shell background
		// while the real workbench boots; removed alongside the color/layout splash once
		// the main container has its first layout pass (see PartsSplash#_removePartsSplash).
		const splashLogo = document.createElement('div');
		splashLogo.id = 'monaco-workbench-splash-logo';
		splashLogo.innerHTML = `
			<svg viewBox="0 0 300 120" width="300" height="120">
				<path class="boot-strand boot-strand-a" d="M10,30 C60,20 90,40 130,60 C170,80 200,100 240,90" />
				<path class="boot-strand boot-strand-b" d="M10,90 C60,100 90,80 130,60 C170,40 200,20 240,30" />
				<path class="boot-arrowhead" d="M233,78 L258,90 L231,102" />
				<path class="boot-arrowhead" d="M233,18 L258,30 L231,42" />
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
