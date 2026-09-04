/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Orchestra の表示モード (かんたん / 上級者) に関する ID 群。
// 実装は orchestraUiMode.ts。React 側やウォーターマーク側から import の順序を気にせず
// 参照できるよう、ID だけをこのファイルに切り出している (actionIDs.ts と同じ理由)。

export type OrchestraUiMode = 'simple' | 'pro';

export const ORCHESTRA_UI_MODE_SETTING = 'orchestra.ui.mode';
export const ORCHESTRA_UI_MODE_CONTEXT_KEY = 'orchestra.uiMode';

export const ORCHESTRA_UI_SET_SIMPLE_MODE_ACTION_ID = 'orchestra.ui.setSimpleMode';
export const ORCHESTRA_UI_SET_PRO_MODE_ACTION_ID = 'orchestra.ui.setProMode';
export const ORCHESTRA_UI_TOGGLE_MODE_ACTION_ID = 'orchestra.ui.toggleMode';

export const ORCHESTRA_UI_TOGGLE_FILES_ACTION_ID = 'orchestra.ui.toggleFiles';
export const ORCHESTRA_UI_TOGGLE_TERMINAL_ACTION_ID = 'orchestra.ui.toggleTerminal';
export const ORCHESTRA_UI_TOGGLE_CHAT_ACTION_ID = 'orchestra.ui.toggleChat';

// ホーム画面の「例」ボタン等から、文字列を 1 つ渡してチャットに送る。引数: userMessage (string)
export const ORCHESTRA_CHAT_SEND_PROMPT_ACTION_ID = 'orchestra.chat.sendPrompt';
