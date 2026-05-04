/*---------------------------------------------------------------------------------------------
 *  AI Chat Sidebar View (Glassmorphism)
 *  -------------------------------------------------------------------------------------------
 *  Renders the AI chat panel inside any container element. Designed to be plugged into a
 *  VS Code ViewPane (or any Electron-hosted DOM root) by calling `attach(container)`.
 *
 *  Usage:
 *      import { AiChatSidebarView } from './aiChatSidebarView.js';
 *      const view = new AiChatSidebarView({ onSubmit: async (text, ctl) => { ... } });
 *      view.attach(myContainer);
 *
 *  The host wires up `onSubmit`, drives the flow via the provided controller, and streams
 *  tokens back through `controller.appendAssistantToken(...)`.
 *--------------------------------------------------------------------------------------------*/

import { AiChatFlowIndicator, FlowStage } from './aiChatFlowIndicator.js';

export interface IAiChatMessage {
	readonly id: string;
	readonly role: 'user' | 'assistant' | 'system';
	text: string;
	streaming?: boolean;
}

export interface IAiChatTurnController {
	setStage(stage: FlowStage): void;
	appendAssistantToken(token: string): void;
	finishAssistant(): void;
	addSystemNote(text: string): void;
}

export interface IAiChatSidebarOptions {
	title?: string;
	placeholder?: string;
	onSubmit: (input: string, controller: IAiChatTurnController) => void | Promise<void>;
	onClear?: () => void;
}

export class AiChatSidebarView {
	private readonly _options: Required<Omit<IAiChatSidebarOptions, 'onSubmit' | 'onClear'>> & IAiChatSidebarOptions;

	private _root!: HTMLElement;
	private _messagesEl!: HTMLElement;
	private _textarea!: HTMLTextAreaElement;
	private _sendBtn!: HTMLButtonElement;
	private _flow!: AiChatFlowIndicator;

	private readonly _messages: IAiChatMessage[] = [];
	private _busy = false;
	private _activeAssistantId: string | null = null;

	constructor(options: IAiChatSidebarOptions) {
		this._options = {
			title: 'AI Chat',
			placeholder: 'Ask anything about your code…',
			...options,
		};
	}

	/** Mounts the view into the given parent container. */
	attach(parent: HTMLElement): void {
		this._root = document.createElement('div');
		this._root.className = 'ai-chat-sidebar';

		this._renderHeader(this._root);
		this._flow = new AiChatFlowIndicator(this._root);
		this._renderMessages(this._root);
		this._renderComposer(this._root);

		parent.appendChild(this._root);

		// Greet
		this._addMessage({
			id: this._uid(),
			role: 'assistant',
			text: 'Hi! I can read your workspace context and help with code, refactors, and explanations.\nAsk me anything to get started.',
		});
	}

	dispose(): void {
		this._flow?.dispose();
		this._root?.remove();
	}

	// ---------------------------------------------------------------------------------------
	// Rendering
	// ---------------------------------------------------------------------------------------

	private _renderHeader(parent: HTMLElement): void {
		const header = document.createElement('div');
		header.className = 'ai-chat-sidebar__header';

		const avatar = document.createElement('div');
		avatar.className = 'ai-chat-sidebar__avatar';
		avatar.textContent = 'AI';
		header.appendChild(avatar);

		const title = document.createElement('div');
		title.className = 'ai-chat-sidebar__title';
		title.textContent = this._options.title!;
		header.appendChild(title);

		const actions = document.createElement('div');
		actions.className = 'ai-chat-sidebar__header-actions';

		const clearBtn = document.createElement('button');
		clearBtn.className = 'ai-chat-sidebar__icon-btn';
		clearBtn.title = 'Clear conversation';
		clearBtn.setAttribute('aria-label', 'Clear conversation');
		clearBtn.textContent = '⌫';
		clearBtn.addEventListener('click', () => this.clear());
		actions.appendChild(clearBtn);

		header.appendChild(actions);
		parent.appendChild(header);
	}

	private _renderMessages(parent: HTMLElement): void {
		this._messagesEl = document.createElement('div');
		this._messagesEl.className = 'ai-chat-sidebar__messages';
		this._messagesEl.setAttribute('role', 'log');
		this._messagesEl.setAttribute('aria-live', 'polite');
		parent.appendChild(this._messagesEl);
	}

	private _renderComposer(parent: HTMLElement): void {
		const composer = document.createElement('div');
		composer.className = 'ai-chat-sidebar__composer';

		const wrap = document.createElement('div');
		wrap.className = 'ai-chat-sidebar__input-wrap';

		this._textarea = document.createElement('textarea');
		this._textarea.className = 'ai-chat-sidebar__textarea';
		this._textarea.rows = 1;
		this._textarea.placeholder = this._options.placeholder!;
		this._textarea.addEventListener('input', () => this._autoSize());
		this._textarea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
				e.preventDefault();
				void this._submit();
			}
		});
		wrap.appendChild(this._textarea);

		this._sendBtn = document.createElement('button');
		this._sendBtn.className = 'ai-chat-sidebar__send';
		this._sendBtn.type = 'button';
		this._sendBtn.textContent = 'Send';
		this._sendBtn.addEventListener('click', () => void this._submit());
		wrap.appendChild(this._sendBtn);

		composer.appendChild(wrap);

		const hint = document.createElement('div');
		hint.className = 'ai-chat-sidebar__hint';
		const left = document.createElement('span');
		left.innerHTML = '<kbd>Enter</kbd> send · <kbd>Shift</kbd>+<kbd>Enter</kbd> newline';
		hint.appendChild(left);
		const right = document.createElement('span');
		right.textContent = 'Glass UI';
		hint.appendChild(right);
		composer.appendChild(hint);

		parent.appendChild(composer);
	}

	// ---------------------------------------------------------------------------------------
	// Behaviour
	// ---------------------------------------------------------------------------------------

	private _autoSize(): void {
		this._textarea.style.height = 'auto';
		this._textarea.style.height = Math.min(this._textarea.scrollHeight, 160) + 'px';
	}

	private async _submit(): Promise<void> {
		if (this._busy) { return; }
		const value = this._textarea.value.trim();
		if (!value) { return; }

		this._textarea.value = '';
		this._autoSize();
		this._setBusy(true);

		this._addMessage({ id: this._uid(), role: 'user', text: value });

		// Create the streaming assistant placeholder up front
		const assistantId = this._uid();
		this._activeAssistantId = assistantId;
		this._addMessage({ id: assistantId, role: 'assistant', text: '', streaming: true });

		const controller: IAiChatTurnController = {
			setStage: (stage) => this._flow.setStage(stage),
			appendAssistantToken: (token) => this._appendToActiveAssistant(token),
			finishAssistant: () => this._finishActiveAssistant(),
			addSystemNote: (text) => this._addMessage({ id: this._uid(), role: 'system', text }),
		};

		// Default flow choreography — the host can override by calling controller.setStage()
		controller.setStage('context');

		try {
			await this._options.onSubmit(value, controller);
			// If the host forgot to mark completion, do it for them.
			if (this._activeAssistantId === assistantId) {
				controller.finishAssistant();
				controller.setStage('done');
			}
		} catch (err) {
			controller.addSystemNote(`Error: ${(err as Error)?.message ?? String(err)}`);
			this._finishActiveAssistant();
			this._flow.setStage('idle');
		} finally {
			this._setBusy(false);
			// Auto-fade the "done" state after a moment so the next turn starts clean.
			window.setTimeout(() => {
				if (!this._busy && this._flow.stage === 'done') { this._flow.reset(); }
			}, 1400);
		}
	}

	private _setBusy(busy: boolean): void {
		this._busy = busy;
		this._sendBtn.disabled = busy;
		this._sendBtn.textContent = busy ? 'Working…' : 'Send';
	}

	// ---------------------------------------------------------------------------------------
	// Message helpers
	// ---------------------------------------------------------------------------------------

	clear(): void {
		this._messages.length = 0;
		this._messagesEl.replaceChildren();
		this._flow.reset();
		this._activeAssistantId = null;
		this._options.onClear?.();
	}

	private _addMessage(msg: IAiChatMessage): void {
		this._messages.push(msg);

		const wrap = document.createElement('div');
		wrap.className = `ai-chat-msg is-${msg.role}`;
		wrap.dataset.id = msg.id;

		const role = document.createElement('div');
		role.className = 'ai-chat-msg__role';
		role.textContent = msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Assistant' : 'System';
		wrap.appendChild(role);

		const bubble = document.createElement('div');
		bubble.className = 'ai-chat-msg__bubble';
		if (msg.streaming) { bubble.classList.add('is-streaming'); }
		bubble.textContent = msg.text;
		wrap.appendChild(bubble);

		this._messagesEl.appendChild(wrap);
		this._scrollToBottom();
	}

	private _appendToActiveAssistant(token: string): void {
		if (!this._activeAssistantId) { return; }
		const msg = this._messages.find(m => m.id === this._activeAssistantId);
		if (!msg) { return; }
		msg.text += token;

		const node = this._messagesEl.querySelector<HTMLElement>(`[data-id="${this._activeAssistantId}"] .ai-chat-msg__bubble`);
		if (node) {
			node.textContent = msg.text;
			this._scrollToBottom();
		}
	}

	private _finishActiveAssistant(): void {
		if (!this._activeAssistantId) { return; }
		const node = this._messagesEl.querySelector<HTMLElement>(`[data-id="${this._activeAssistantId}"] .ai-chat-msg__bubble`);
		node?.classList.remove('is-streaming');
		const msg = this._messages.find(m => m.id === this._activeAssistantId);
		if (msg) { msg.streaming = false; }
		this._activeAssistantId = null;
	}

	private _scrollToBottom(): void {
		this._messagesEl.scrollTop = this._messagesEl.scrollHeight;
	}

	private _uid(): string {
		return 'm_' + Math.random().toString(36).slice(2, 10);
	}
}
