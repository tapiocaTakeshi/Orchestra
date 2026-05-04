/*---------------------------------------------------------------------------------------------
 *  Minimal Welcome — renderer 側ロジック
 *
 *  このファイルは Electron renderer 上で動作し、
 *  workbench の host bridge (`acquireVsCodeApi()`) を通じて
 *  最近のワークスペース取得 / コマンド実行を行う。
 *
 *  - 取得経路: `IWorkspacesHistoryMainService.getRecentlyOpened()`
 *      → IPC: `vscode:fetchRecentlyOpened`
 *      （実装は workspacesManagementMainService.ts 側を参照）
 *  - 設定: `workbench.startupEditor` の値を “welcomePage” / “none” でトグル
 *--------------------------------------------------------------------------------------------*/

interface IRecentEntry {
	readonly label: string;
	readonly path: string;
	readonly uri: string;
}

interface IHostBridge {
	postMessage<T = unknown>(message: { type: string; payload?: T }): void;
	getState<T = unknown>(): T | undefined;
	setState<T>(state: T): void;
}

declare function acquireVsCodeApi(): IHostBridge;

const VSCODE_API: IHostBridge | undefined = (() => {
	try {
		return typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
	} catch {
		return undefined;
	}
})();

function send(type: string, payload?: unknown): void {
	VSCODE_API?.postMessage({ type, payload });
}

function bindActionButtons(): void {
	const buttons = document.querySelectorAll<HTMLButtonElement>('.minimal-welcome__action[data-command]');
	buttons.forEach(button => {
		button.addEventListener('click', () => {
			const command = button.dataset.command;
			if (command) {
				send('runCommand', { command });
			}
		});
	});
}

function bindStartupToggle(): void {
	const checkbox = document.getElementById('mw-show-on-startup') as HTMLInputElement | null;
	if (!checkbox) {
		return;
	}

	send('getStartupEditor');

	checkbox.addEventListener('change', () => {
		send('setStartupEditor', { value: checkbox.checked ? 'welcomePage' : 'none' });
	});
}

function renderRecents(entries: ReadonlyArray<IRecentEntry>): void {
	const list = document.getElementById('mw-recent-list');
	if (!list) {
		return;
	}

	list.replaceChildren();

	if (!entries || entries.length === 0) {
		const empty = document.createElement('li');
		empty.className = 'minimal-welcome__empty';
		empty.textContent = '最近開いたワークスペースはありません。';
		list.appendChild(empty);
		return;
	}

	for (const entry of entries.slice(0, 5)) {
		const item = document.createElement('li');
		item.className = 'minimal-welcome__recent';
		item.tabIndex = 0;
		item.setAttribute('role', 'button');
		item.setAttribute('aria-label', `${entry.label} を開く`);

		const name = document.createElement('span');
		name.className = 'minimal-welcome__recent-name';
		name.textContent = entry.label;

		const path = document.createElement('span');
		path.className = 'minimal-welcome__recent-path';
		path.textContent = entry.path;

		item.appendChild(name);
		item.appendChild(path);

		const open = () => send('openRecent', { uri: entry.uri });
		item.addEventListener('click', open);
		item.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				open();
			}
		});

		list.appendChild(item);
	}
}

function listenHostMessages(): void {
	window.addEventListener('message', (event: MessageEvent) => {
		const data = event.data as { type?: string; payload?: unknown } | undefined;
		if (!data || typeof data.type !== 'string') {
			return;
		}

		switch (data.type) {
			case 'recentlyOpened':
				renderRecents((data.payload as IRecentEntry[]) ?? []);
				break;
			case 'startupEditor': {
				const checkbox = document.getElementById('mw-show-on-startup') as HTMLInputElement | null;
				if (checkbox) {
					checkbox.checked = (data.payload as { value?: string })?.value !== 'none';
				}
				break;
			}
		}
	});
}

function init(): void {
	bindActionButtons();
	bindStartupToggle();
	listenHostMessages();
	send('fetchRecentlyOpened');
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
	init();
}

export {}; // ensure module scope
