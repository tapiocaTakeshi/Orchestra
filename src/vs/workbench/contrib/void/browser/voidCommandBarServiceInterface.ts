/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// IVoidCommandBarService の decorator (と interface) は、実装である
// voidCommandBarService.ts ではなくこのファイルに置く。
// editCodeServiceInterface.ts / chatThreadServiceInterface.ts と同じ
// 「実装と decorator を分離する」パターン。
//
// 理由: voidCommandBarService.ts は react/out/void-editor-widgets-tsx/index.js を
// import しており、そのバンドルは react 側 util/services.ts の外部 import 経由で
// voidCommandBarService.ts へ戻ってくる循環 import になっている。バンドラ
// (esbuild) は循環を検出すると片方のモジュールを先に評価するため、先に評価される
// toolsService / editCodeService から見ると voidCommandBarService.ts の
// `const IVoidCommandBarService` はまだ未初期化 (バンドル後は巻き上げられた `var`
// なので undefined) で、
//   TypeError: decorator is not a function
// となり workbench 全体の起動が失敗する。
//
// このファイルは createDecorator 以外に実行時依存を持たない (型は import type で
// 参照するだけなので出力 JS からは消える)。そのため必ず利用側より先に評価され、
// 循環に巻き込まれない。**decorator を使う側は必ずこのファイルから import すること。**

import type { Event } from '../../../../base/common/event.js';
import type { URI } from '../../../../base/common/uri.js';
import type { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';


export type CommandBarStateType = undefined | {
	sortedDiffZoneIds: string[]; // sorted by line number
	sortedDiffIds: string[]; // sorted by line number (computed)
	isStreaming: boolean; // is any diffZone streaming in this URI

	diffIdx: number | null; // must refresh whenever sortedDiffIds does so it's valid
}


export type VoidCommandBarProps = {
	uri: URI | null;
	editor: ICodeEditor;
}


export interface IVoidCommandBarService {
	readonly _serviceBrand: undefined;
	stateOfURI: { [uri: string]: CommandBarStateType };
	sortedURIs: URI[];
	activeURI: URI | null;

	onDidChangeState: Event<{ uri: URI }>;
	onDidChangeActiveURI: Event<{ uri: URI | null }>;

	getStreamState: (uri: URI) => 'streaming' | 'idle-has-changes' | 'idle-no-changes';
	setDiffIdx(uri: URI, newIdx: number | null): void;

	getNextDiffIdx(step: 1 | -1): number | null;
	getNextUriIdx(step: 1 | -1): number | null;
	goToDiffIdx(idx: number | null): void;
	goToURIIdx(idx: number | null): Promise<void>;

	acceptOrRejectAllFiles(opts: { behavior: 'reject' | 'accept' }): void;
	anyFileIsStreaming(): boolean;

}


export const IVoidCommandBarService = createDecorator<IVoidCommandBarService>('VoidCommandBarService');
