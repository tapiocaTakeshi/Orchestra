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

	//#region Splash Screen Helpers

	// Orchestra: small red circular logo mark shown while the workbench boots
	const SPLASH_LOGO_DATA_URI = 'data:image/png;base64,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';

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

		const style = document.createElement('style');
		style.className = 'initialShellColors';
		window.document.head.appendChild(style);
		style.textContent = `
			body { background-color: ${shellBackground}; color: ${shellForeground}; margin: 0; padding: 0; }
			#monaco-workbench-splash-logo { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; pointer-events: none; }
			#monaco-workbench-splash-logo .logo-ring { position: absolute; width: 96px; height: 96px; border-radius: 50%; background: conic-gradient(from 0deg, transparent 0deg, #e02431 100deg, transparent 210deg); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px)); animation: monaco-workbench-splash-spin 1.3s linear infinite; }
			#monaco-workbench-splash-logo img { width: 64px; height: 64px; filter: drop-shadow(0 8px 24px rgba(224, 36, 49, .35)); animation: monaco-workbench-splash-in .8s cubic-bezier(.22, 1.2, .36, 1) both, monaco-workbench-splash-pulse 2.2s ease-in-out .8s infinite; }
			@keyframes monaco-workbench-splash-spin { to { transform: rotate(360deg); } }
			@keyframes monaco-workbench-splash-in { 0% { opacity: 0; transform: scale(.5) rotate(-40deg); } 100% { opacity: 1; transform: scale(1) rotate(0deg); } }
			@keyframes monaco-workbench-splash-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
			@media (prefers-reduced-motion: reduce) { #monaco-workbench-splash-logo .logo-ring, #monaco-workbench-splash-logo img { animation: none; } }
		`;

		// Orchestra: animated logo shown centered over the shell background while the
		// real workbench boots; removed alongside the color/layout splash once the
		// main container has its first layout pass (see PartsSplash#_removePartsSplash).
		const splashLogo = document.createElement('div');
		splashLogo.id = 'monaco-workbench-splash-logo';
		const splashLogoRing = document.createElement('div');
		splashLogoRing.className = 'logo-ring';
		const splashLogoImg = document.createElement('img');
		splashLogoImg.src = SPLASH_LOGO_DATA_URI;
		splashLogoImg.alt = '';
		splashLogo.appendChild(splashLogoRing);
		splashLogo.appendChild(splashLogoImg);
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
	);

	// Mark start of workbench
	performance.mark('code/didLoadWorkbenchMain');

	// Load workbench
	result.main(configuration);
}());
