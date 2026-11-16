/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// タイトルバーの表示モード切り替え (クラウドエージェント ⇄ IDE)。
//
// 「表示モードを切り替える」コマンド (orchestraUiMode.ts) のタイトルバー項目を、アイコン 1 つではなく
// 2 つの区画が並んだ小さなスイッチとして描く:
//
//   ( ☁ クラウド | ☁̸ IDE )   … 今のモードの区画の下につまみ (thumb) が入り、切り替えると横に滑る
//
// - スイッチ全体が 1 つのボタン。キーボード (Enter / Space) や区画の外側のクリックは「切り替え」。
// - 区画をクリックしたときはそのモードにする (今のモードの区画なら何も切り替えない)。
// - 切り替えるとタイトルバーの他のボタン (☁・Division・カンバン) が出入りし、ツールバーごと作り直される。
//   そのため、前に描いたときのモードを覚えておき、新しいスイッチはそこから今のモードへ滑らせる。

import { $, append, EventLike, getWindow, isHTMLElement } from '../../../../base/browser/dom.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import {
	ORCHESTRA_UI_MODE_SETTING,
	ORCHESTRA_UI_SET_CLOUD_MODE_ACTION_ID,
	ORCHESTRA_UI_SET_PRO_MODE_ACTION_ID,
	ORCHESTRA_UI_TOGGLE_MODE_ACTION_ID,
	OrchestraUiMode,
	parseOrchestraUiMode,
} from './orchestraUiModeTypes.js';
import './media/orchestraModeSwitch.css';

/** 直前に描いたスイッチのモード (作り直されたスイッチを、ここから今のモードへ滑らせる) */
let lastShownMode: OrchestraUiMode | undefined;

class OrchestraModeSwitchViewItem extends BaseActionViewItem {

	private segments: { mode: OrchestraUiMode; el: HTMLElement }[] = [];

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super(undefined, action, options);
	}

	private get mode(): OrchestraUiMode {
		return parseOrchestraUiMode(this.configurationService.getValue(ORCHESTRA_UI_MODE_SETTING));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('orchestra-mode-switch-item');

		const root = append(container, $('.orchestra-mode-switch'));
		append(root, $('span.orchestra-mode-switch-thumb'));
		this.segments = [
			{ mode: 'cloud', el: this.renderSegment(root, 'cloud', Codicon.cloud, localize('orchestraModeSwitch.cloud', "クラウド")) },
			{ mode: 'pro', el: this.renderSegment(root, 'pro', undefined, localize('orchestraModeSwitch.ide', "IDE")) },
		];

		const current = this.mode;
		if (lastShownMode && lastShownMode !== current) {
			// 前のモードの位置で描いてから、次のフレームで今のモードへ滑らせる
			this.apply(root, lastShownMode);
			const handle = getWindow(container).requestAnimationFrame(() => this.apply(root, this.mode));
			this._register({ dispose: () => getWindow(container).cancelAnimationFrame(handle) });
		} else {
			this.apply(root, current);
		}
		lastShownMode = current;

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ORCHESTRA_UI_MODE_SETTING)) {
				lastShownMode = this.mode;
				this.apply(root, this.mode);
			}
		}));
		this._register(this.keybindingService.onDidUpdateKeybindings(() => this.updateTooltip()));
	}

	private renderSegment(root: HTMLElement, mode: OrchestraUiMode, icon: ThemeIcon | undefined, label: string): HTMLElement {
		const seg = append(root, $('span.orchestra-mode-switch-segment'));
		seg.dataset.mode = mode;
		// IDE 側のアイコンは「斜線の入った雲」(orchestraUiMode.ts の orchestra-cloud-off)。CSS で斜線を重ねる
		const iconEl = append(seg, $('span.orchestra-mode-switch-icon'));
		iconEl.classList.add(...ThemeIcon.asClassNameArray(icon ?? Codicon.cloud));
		if (!icon) {
			iconEl.classList.add('orchestra-mode-switch-icon-off');
		}
		append(seg, $('span.orchestra-mode-switch-label')).textContent = label;
		return seg;
	}

	private apply(root: HTMLElement, mode: OrchestraUiMode): void {
		root.dataset.mode = mode;
		for (const s of this.segments) {
			s.el.classList.toggle('active', s.mode === mode);
		}
		if (this.element) {
			this.element.setAttribute('role', 'switch');
			this.element.setAttribute('aria-checked', String(mode === 'pro'));
		}
		this.updateTooltip();
	}

	protected override getTooltip(): string {
		const kb = this.keybindingService.lookupKeybinding(ORCHESTRA_UI_TOGGLE_MODE_ACTION_ID)?.getLabel();
		const text = this.mode === 'cloud'
			? localize('orchestraModeSwitch.tooltip.cloud', "クラウドエージェントモード — クリックで IDE モードに切り替え")
			: localize('orchestraModeSwitch.tooltip.pro', "IDE モード — クリックでクラウドエージェントモードに切り替え");
		return kb ? `${text} (${kb})` : text;
	}

	override onClick(event: EventLike, preserveFocus = false): void {
		// 区画を直接クリックしたら、そのモードにする (今のモードなら setUiMode 側で何もしないか、パネルを前面に出すだけ)
		const target = (event as { target?: unknown }).target;
		const seg = isHTMLElement(target) ? target.closest<HTMLElement>('.orchestra-mode-switch-segment') : null;
		const mode = seg?.dataset.mode;
		if (mode === 'cloud' || mode === 'pro') {
			if (mode !== this.mode) {
				void this.commandService.executeCommand(mode === 'pro' ? ORCHESTRA_UI_SET_PRO_MODE_ACTION_ID : ORCHESTRA_UI_SET_CLOUD_MODE_ACTION_ID);
			}
			return;
		}
		super.onClick(event, preserveFocus);
	}
}

class OrchestraModeSwitchContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.orchestraModeSwitch';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(actionViewItemService.register(MenuId.TitleBar, ORCHESTRA_UI_TOGGLE_MODE_ACTION_ID, (action, options) =>
			instantiationService.createInstance(OrchestraModeSwitchViewItem, action, options)));
	}
}
// タイトルバーが最初に描かれる前に登録しておく
registerWorkbenchContribution2(OrchestraModeSwitchContribution.ID, OrchestraModeSwitchContribution, WorkbenchPhase.BlockStartup);
