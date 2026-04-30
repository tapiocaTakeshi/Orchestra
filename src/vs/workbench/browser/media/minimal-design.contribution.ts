/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Minimal Design Contribution
 *
 * Workbench 起動時にミニマルデザインのスタイルシートをロードする。
 * 機能ロジックは持たず、CSS の取り込みのみを担当する（副作用 import）。
 *
 * 取り込み順:
 *   1. minimal-tokens.css  (デザイントークン)
 *   2. minimal-design.css  (Workbench 上書き)
 *
 * ※ minimal-design.css 内で tokens を `@import` しているため、
 *    本ファイルでは minimal-design.css のみを読み込めば十分だが、
 *    ロード順を明示するため両方を import している。
 */

import './minimal-tokens.css';
import './minimal-design.css';
