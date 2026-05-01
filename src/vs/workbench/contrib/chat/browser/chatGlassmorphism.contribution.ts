/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/chatGlassmorphism';

import { Disposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import {
	IWorkbenchContributionsRegistry,
	Extensions as WorkbenchExtensions,
	IWorkbenchContribution,
} from 'vs/workbench/common/contributions';

/**
 * Adds a marker class to the workbench root so the Glassmorphism stylesheet can scope
 * its rules and so future fine‑tuning (e.g. flow indicator markers) can be done cheaply
 * without touching the chat view implementation directly.
 */
class ChatGlassmorphismContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatGlassmorphism';

	constructor() {
		super();
		this.applyMarker();
	}

	private applyMarker(): void {
		try {
			const root = typeof document !== 'undefined' ? document.body : undefined;
			if (root && !root.classList.contains('chat-glassmorphism')) {
				root.classList.add('chat-glassmorphism');
			}
		} catch {
			// no-op: in non-browser contexts (tests) we silently ignore.
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(ChatGlassmorphismContribution, LifecyclePhase.Restored);
