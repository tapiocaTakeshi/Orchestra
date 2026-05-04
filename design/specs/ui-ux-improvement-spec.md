# Electron UI/UX 改善 仕様書

対象: Electron Project (Orchestra 等のデスクトップアプリ)
バージョン: 1.0
ステータス: 承認待ち → 実装着手可

---

## 1. 目的
既存 Electron アプリの UI/UX を改善し、以下を実現する。

- 画面構造を分かりやすくする
- 操作導線を短くし、迷いを減らす
- 視認性・可読性を改善する
- 状態変化や処理結果を適切にフィードバックする
- 今後の機能追加に耐えられる UI 設計に整理する

## 2. 設計コンセプト
- **Desktop-Native Experience**: ショートカット、リサイズ追従、OS 標準操作感
- **Task-Oriented**: ノイズの少ない、作業集中型 UI
- **Consistency**: コンポーネント再利用で保守コスト削減

## 3. レイアウトフレームワーク
| 領域 | 役割 |
| --- | --- |
| Global Sidebar (左) | 主要機能切替 (Dashboard / Projects / Tasks / Team / Settings) |
| Main Header (上) | 検索、通知、プロファイル、ウィンドウコントロール |
| Content Area (中央) | アクティブタスクの表示 |
| Utility/Status Bar (下) | 進捗・ログ・ショートカットヒント |

## 4. 画面アーキテクチャ
| 画面 | 役割 | 主要要素 |
| --- | --- | --- |
| Dashboard | 全体俯瞰 | 統計カード、活動ログ、チャート |
| Editor/Workspace | メイン作業 | 操作パネル、タイムライン、プロパティ |
| Settings | アプリ設定 | 環境設定、ショートカット、テーマ |
| Modal Overlays | 補助操作 | ファイル選択、確認、通知 |

## 5. 導線設計
- **Breadcrumb**: 階層がある画面で上部に配置
- **Command Palette**: `Cmd/Ctrl + K` で画面遷移・主要操作を呼び出し
- **Deep Link**: 任意のワーク単位へ直接ナビゲート可能にする

## 6. 状態設計
- **UI State**: Zustand (軽量)
- **App Logic State**: Redux Toolkit もしくはサービス層で分離
- **Persistence**: `electron-store` でウィンドウ状態・直前セッション復元

## 7. 状態表示ルール
| 状態 | UI |
| --- | --- |
| Loading | スケルトン or スピナー + 文言 |
| Success | Toast / インライン |
| Error | 原因 + 対処 + 再試行ボタン |
| Empty | 理由 + 次アクション導線 |

## 8. コンポーネント方針
- **ベース**: Tailwind CSS + Radix UI / Headless UI
- **Design Tokens**: `design/tokens/tokens.css` を SSoT とする
- **構造**: Atomic Design
  - atoms: Button / Input / Icon / Tag
  - molecules: SearchBar / FormField / ToastItem
  - organisms: Sidebar / Header / EditorPanel
  - templates: MainLayout / AuthLayout

## 9. キーボード操作 (Desktop-First)
| ショートカット | 機能 |
| --- | --- |
| Cmd/Ctrl + K | コマンドパレット/検索 |
| Cmd/Ctrl + S | 保存 |
| Cmd/Ctrl + Enter | 実行 |
| Esc | モーダル閉じる / フォーカス戻す |
| Tab / Shift+Tab | フォーカス移動 |
| ↑/↓ | リスト選択移動 |
| Enter | 選択項目の詳細表示 |

## 10. Electron 特有考慮
- **カスタムタイトルバー**: `-webkit-app-region` でドラッグ領域と操作領域を分離
- **ネイティブダイアログ**: ファイル選択/保存は OS 標準優先
- **ウィンドウ永続化**: 位置・サイズ・開いたタブを保存
- **OS 差異**: macOS / Windows のメニュー配置、アクセラレータ差を吸収
- **パフォーマンス**: 仮想スクロール、React.memo、CSS transform/opacity のみでアニメーション

## 11. アクセシビリティ
- WCAG AA コントラスト (4.5:1) を確保
- `:focus-visible` のリング保持
- アイコンのみボタンに `aria-label`
- モーダルはフォーカストラップ + ESC クローズ
- `prefers-reduced-motion` でアニメーション抑制

## 12. 実装フェーズ
1. **Phase 1 — 基盤**: レイアウト・ルーティング・トークン導入
2. **Phase 2 — デザインシステム**: 共通コンポーネント実装
3. **Phase 3 — メイン機能**: Dashboard / Editor 画面
4. **Phase 4 — UX 強化**: ショートカット、状態表示、通知

## 13. 優先度
### 高
- レイアウト整理、Loading/Empty/Error 状態の統一、主要フォーム/モーダル刷新
### 中
- トースト、キーボード操作、テーブル/検索 UI
### 低
- アニメーション微調整、テーマ拡張

## 14. 完了条件
- 主要画面のレイアウトが統一されている
- ボタン・入力・モーダルの挙動が統一されている
- Loading / Empty / Error / Success が実装されている
- 一覧/詳細/編集/設定の主要導線が明確
- リサイズ/OS 差異で破綻がない
- 既存機能を壊さず操作性が向上している

## 15. 関連成果物
- `design/prototypes/orchestra-dashboard.html` — ダッシュボードプロトタイプ
- `design/tokens/tokens.css` — デザイントークン (SSoT)
- `design/specs/ui-ux-improvement-spec.md` — 本仕様書
