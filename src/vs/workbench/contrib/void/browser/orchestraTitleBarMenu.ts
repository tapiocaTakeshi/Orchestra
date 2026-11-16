/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { MenuId } from '../../../../platform/actions/common/actions.js';

// タイトルバーの「⋯」(クラウドエージェントモードのときだけ出す) の中身。
// タイトルバーにボタンを並べすぎないよう、Division プロジェクト・カンバンなどはここにまとめる
// (登録は orchestraUiMode.ts、項目は voidSettingsPane.ts / kanbanPane.ts)。
export const OrchestraTitleBarMoreMenu = new MenuId('OrchestraTitleBarMore');
