/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// ICloudAgentService の decorator (と interface・状態の型) は、実装である cloudAgentService.ts
// ではなくこのファイルに置く。chatThreadServiceInterface.ts と同じ「実装と decorator を分離する」パターン。
//
// React の services.ts から import されるので、実装側の依存 (voidSettingsService など) を
// 引き込むと循環 import の輪に入り、バンドル後に `decorator is not a function` で
// workbench の起動が失敗する (build/checkDecoratorInitOrder.js が検出する)。
// このファイルは createDecorator 以外に実行時依存を持たない (型は import type だけ)。

import type { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import type { CloudChange, CloudSession, CloudSessionEvent } from '../common/cloudAgentTypes.js';


/** 「変更を取り込む」の結果 (パスはワークスペースからの相対パス) */
export type CloudApplyResult = {
	/** エディタに差分 (承認待ち) として入れた / バイナリとして書き込んだ */
	applied: string[];
	/** ローカルのファイルがアップロード時から変わっていた (それでも取り込んではいる) */
	conflicts: string[];
	/** 削除したファイル */
	deleted: string[];
	/** ローカルが既にクラウドと同じ中身だったので何もしなかった */
	unchanged: string[];
	failed: { path: string; error: string }[];
};

export type CloudChangesState = {
	loading: boolean;
	changes?: CloudChange[];
	patch?: string;
	patchTruncated?: boolean;
	error?: string;
	applying?: boolean;
	lastApply?: CloudApplyResult;
};

export type CloudAgentState = {
	sessions: CloudSession[];
	eventsById: Record<string, CloudSessionEvent[]>;
	selectedId: string | null;
	/** 一覧の初回読み込み中 */
	loading: boolean;
	lastError: string | null;
	/** 「起動」を押してから、全セッションの起動 (作成 → アップロード → 開始) が終わるまで */
	creating: boolean;
	/** 起動中の進捗 (例: 「ワークスペースをアップロード中 (2/3)」)。起動していなければ null */
	creatingProgress: string | null;
	changesById: Record<string, CloudChangesState>;
	isLoggedIn: boolean;
	/** 送信中の追加指示があるセッション */
	sendingById: Record<string, boolean>;
	/** ワークスペース (最初のフォルダ) の名前。フォルダを開いていなければ null */
	workspaceName: string | null;
	/**
	 * 「新しいクラウドエージェント」コマンドで増える番号。パネルはこれが前回見た値より
	 * 大きくなったら入力欄にフォーカスする (パネルのマウント前に来た要求も取りこぼさない)。
	 */
	focusFormRequest: number;
};

export type CreateCloudSessionsOptions = {
	prompt: string;
	title?: string;
	/** provider/model の指定。空ならプロジェクトの coder 割り当て */
	model?: string;
	/** ワークスペースを tar.gz にしてサンドボックスへ送る */
	includeWorkspace: boolean;
	/** 同じ指示で並列に起動するセッション数 (1〜10) */
	count?: number;
};

export interface ICloudAgentService {
	readonly _serviceBrand: undefined;

	readonly state: CloudAgentState;
	readonly onDidChangeState: Event<void>;

	refresh(): Promise<void>;
	createSession(opts: CreateCloudSessionsOptions): Promise<CloudSession[]>;
	select(id: string | null): void;
	sendMessage(id: string, text: string): Promise<boolean>;
	stop(id: string): Promise<void>;
	/** 動いているセッションをすべて止める。止めた数を返す */
	stopAll(): Promise<number>;
	archive(id: string): Promise<void>;
	loadChanges(id: string): Promise<void>;
	/** サンドボックスの変更をワークスペース (最初のフォルダ) に差分として取り込む。paths 省略で全部 */
	applyChanges(id: string, paths?: string[]): Promise<CloudApplyResult | null>;
	openPane(): Promise<void>;
	/** パネルの表示状態 (表示中はポーリングを速くする)。cloudAgentsPane.ts から呼ぶ */
	setPaneVisible(visible: boolean): void;
	requestFocusForm(): void;
	dismissError(): void;
}

export const ICloudAgentService = createDecorator<ICloudAgentService>('cloudAgentService');
