/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Chat サイドバーの Glassmorphism テーマを workbench にロードするためのエントリ。
// 既存の chat contribution の import チェーンに本ファイルを追加することで CSS が読み込まれる。
//
// 例: src/vs/workbench/workbench.common.main.ts などで
//   import 'vs/workbench/contrib/chat/browser/media/chatGlassmorphism.contribution';
// のように import するだけで適用される（ロジックは含まない、副作用 import）。

import './chatGlassmorphism.css';
