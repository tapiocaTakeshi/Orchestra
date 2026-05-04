/*---------------------------------------------------------------------------------------------
 *  AI Chat — Flow Indicator
 *  Renders a 4-step pipeline (Context → Thinking → Generating → Done) and exposes a small
 *  imperative API to advance / reset the current stage.
 *--------------------------------------------------------------------------------------------*/

export type FlowStage = 'idle' | 'context' | 'thinking' | 'generating' | 'done';

interface IFlowStepDef {
	readonly id: Exclude<FlowStage, 'idle'>;
	readonly label: string;
	readonly glyph: string; // single-char glyph (kept ASCII to avoid icon-font dependency)
}

const STEPS: readonly IFlowStepDef[] = [
	{ id: 'context',    label: 'Context',    glyph: '#' },
	{ id: 'thinking',   label: 'Thinking',   glyph: '*' },
	{ id: 'generating', label: 'Generating', glyph: '>' },
	{ id: 'done',       label: 'Done',       glyph: '✓' },
];

export class AiChatFlowIndicator {
	private readonly _root: HTMLElement;
	private readonly _stepEls = new Map<IFlowStepDef['id'], HTMLElement>();
	private _stage: FlowStage = 'idle';

	constructor(parent: HTMLElement) {
		this._root = document.createElement('div');
		this._root.className = 'ai-chat-flow';
		this._root.setAttribute('role', 'progressbar');
		this._root.setAttribute('aria-label', 'AI response progress');

		for (const step of STEPS) {
			const el = document.createElement('div');
			el.className = 'ai-chat-flow__step';
			el.dataset.step = step.id;

			const icon = document.createElement('div');
			icon.className = 'ai-chat-flow__icon';
			icon.textContent = step.glyph;
			el.appendChild(icon);

			const label = document.createElement('div');
			label.className = 'ai-chat-flow__label';
			label.textContent = step.label;
			el.appendChild(label);

			this._stepEls.set(step.id, el);
			this._root.appendChild(el);
		}

		parent.appendChild(this._root);
		this.setStage('idle');
	}

	get element(): HTMLElement { return this._root; }
	get stage(): FlowStage { return this._stage; }

	setStage(stage: FlowStage): void {
		this._stage = stage;
		const order = STEPS.map(s => s.id);
		const activeIdx = stage === 'idle' ? -1 : order.indexOf(stage);

		for (let i = 0; i < order.length; i++) {
			const el = this._stepEls.get(order[i])!;
			el.classList.remove('is-active', 'is-done');

			if (stage === 'done') {
				// Mark every step as done
				el.classList.add('is-done');
			} else if (activeIdx === -1) {
				// idle — nothing highlighted
			} else if (i < activeIdx) {
				el.classList.add('is-done');
			} else if (i === activeIdx) {
				el.classList.add('is-active');
			}
		}

		this._root.setAttribute('aria-valuetext', stage);
	}

	/** Convenience: advance to the next stage in order. */
	next(): FlowStage {
		const order: FlowStage[] = ['idle', 'context', 'thinking', 'generating', 'done'];
		const idx = order.indexOf(this._stage);
		const nextStage = order[Math.min(idx + 1, order.length - 1)];
		this.setStage(nextStage);
		return nextStage;
	}

	reset(): void { this.setStage('idle'); }

	dispose(): void {
		this._stepEls.clear();
		this._root.remove();
	}
}
