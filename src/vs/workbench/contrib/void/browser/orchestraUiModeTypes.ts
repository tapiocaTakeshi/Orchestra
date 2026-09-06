/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Orchestra の表示モード (エージェント / 上級者) に関する ID 群。
// 実装は orchestraUiMode.ts。React 側やウォーターマーク側から import の順序を気にせず
// 参照できるよう、ID だけをこのファイルに切り出している (actionIDs.ts と同じ理由)。

// 'agent': エージェントモード。AI エージェントに作業を任せる画面。IDE 的な部品は隠す。
// 'pro':   上級者モード。VS Code と同じ IDE の表示。
export type OrchestraUiMode = 'agent' | 'pro';

export const ORCHESTRA_UI_MODE_SETTING = 'orchestra.ui.mode';
export const ORCHESTRA_UI_MODE_CONTEXT_KEY = 'orchestra.uiMode';

// エージェントが動いている間 true (LLM の生成中・ツール実行中)。タイトルバーの「止める」ボタンの出し分けに使う。
export const ORCHESTRA_AGENT_RUNNING_CONTEXT_KEY = 'orchestra.agentRunning';
// エージェントがユーザーの承認 (ツール実行の許可・フローのレビュー) を待っている間 true。
export const ORCHESTRA_AGENT_AWAITING_CONTEXT_KEY = 'orchestra.agentAwaitingUser';

export const ORCHESTRA_UI_SET_AGENT_MODE_ACTION_ID = 'orchestra.ui.setAgentMode';
export const ORCHESTRA_UI_SET_PRO_MODE_ACTION_ID = 'orchestra.ui.setProMode';
export const ORCHESTRA_UI_TOGGLE_MODE_ACTION_ID = 'orchestra.ui.toggleMode';

export const ORCHESTRA_UI_TOGGLE_FILES_ACTION_ID = 'orchestra.ui.toggleFiles';
export const ORCHESTRA_UI_TOGGLE_TERMINAL_ACTION_ID = 'orchestra.ui.toggleTerminal';
export const ORCHESTRA_UI_TOGGLE_CHAT_ACTION_ID = 'orchestra.ui.toggleChat';

// 動いているエージェントを全部止める / 承認待ちのエージェントのところへ移動する
export const ORCHESTRA_AGENT_STOP_ACTION_ID = 'orchestra.agent.stopAll';
export const ORCHESTRA_AGENT_SHOW_PENDING_ACTION_ID = 'orchestra.agent.showPending';

// ホーム画面の「例」ボタン等から、文字列を 1 つ渡してエージェントに送る。引数: userMessage (string)
export const ORCHESTRA_CHAT_SEND_PROMPT_ACTION_ID = 'orchestra.chat.sendPrompt';
