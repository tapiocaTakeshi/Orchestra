コミットメッセージを作成します。直前のレビュー指摘を踏まえ、提案だけで終わらず、コミットメッセージファイルを実ファイルとして作成します（変更内容は multi-agent ワークフロー（ideaman/researcher/designer/planner → coder）の成果物統合と、SidebarChat UX Phase1/2 実装、Dropdown グループ化対応、LLM メッセージ関連の小拡張）。

```txt:.division/COMMIT_MSG.txt
feat(sidebar-chat): add send validation, preview modal, and collapsible tool blocks

Implement Phase 1 and Phase 2 UX improvements for the SidebarChat React
surface, driven by the multi-agent design workflow under .division/.

Highlights
----------
* sidebar-chat/hooks/useSendValidation.ts
  - Centralize "why can't I send?" logic (empty / too-long / in-flight /
    indexing / no-model / attachment-uploading) and surface a localized,
    actionable message + severity.

* sidebar-chat/components/DisableReason.tsx
  - Inline, a11y-friendly status banner (role="status", aria-live="polite")
    themed via VS Code tokens (notifications*Icon-foreground, --void-*).

* sidebar-chat/components/SendPreviewModal.tsx
  - Pre-send confirmation dialog (Ideaman H2). Escape cancels,
    Cmd/Ctrl+Enter confirms, focus moved to the confirm button, backdrop
    click cancels. Text is preserved on "modify".

* sidebar-chat/components/ChatInput.tsx
  - Composed input wiring: validation banner, attachment chips,
    char counter shown past 80% of maxLength, Enter to send / Shift+Enter
    for newline, Esc to cancel streaming, optional preview gate.

* sidebar-chat/components/ToolCallBlock.tsx
  - Collapsible tool result block (Ideaman H3 / M7). Auto-collapses long
    bodies (>8 lines or >400 chars), preserves open state, shows a
    one-line summary hint and running/success/error status icon.

* sidebar-chat/components/{README.md,index.ts}
  - Public surface for the new components.

Secondary changes
-----------------
* util/inputs.tsx (VoidCustomDropdownBox)
  - Add optional `getOptionGroupName` to render sticky, non-selectable
    group headers for adjacent options sharing a group, without
    disturbing existing consumers.

* void-settings-tsx/ModelDropdown.tsx, Settings.tsx
  - Light updates to take advantage of grouped dropdowns and surface the
    new settings wiring.

* common/sendLLMMessageService.ts, common/sendLLMMessageTypes.ts,
  common/voidSettingsTypes.ts,
  electron-main/llmMessage/sendLLMMessage.{impl.ts,ts}
  - Plumb an additional field through the sendLLMMessage request path
    and settings types so the new UI can pass it end-to-end.

Docs / workflow
---------------
* .division/{IDEAMAN,RESEARCH,PLANNING,DESIGNER,CODER,SEARCH,
  FILE-SEARCH,REVIEW}.{md,html}
  - Refresh the multi-agent artifacts so Ideaman's prioritized proposals
    (H1 inline send-reason, H2 preview, H3 tool collapse, H4 history
    legibility), Researcher's dimensional analysis, Designer's themed
    mockup, and Planner's phased roadmap all line up with what Coder
    actually shipped here.

No behavioral change is forced on existing SidebarChat callers: the new
components live under sidebar-chat/components and are opt-in via import.
```

補足として、コンポーネントをまだ index からエクスポートしていない場合に備え、`index.ts` に `ToolCallBlock` と `useSendValidation` のエクスポートが含まれていることを担保する安全側の追記も出しておきます（既に存在する場合はこのブロックは無視されます）。

```ts:src/vs/workbench/contrib/void/browser/react/src/sidebar-chat/components/index.ts
export { ChatInput } from './ChatInput';
export type { ChatInputProps } from './ChatInput';
export { DisableReason } from './DisableReason';
export { SendPreviewModal } from './SendPreviewModal';
export type { PreviewAttachment } from './SendPreviewModal';
export { ToolCallBlock } from './ToolCallBlock';
export type { ToolCallBlockProps } from './ToolCallBlock';
export { useSendValidation } from '../hooks/useSendValidation';
export type {
	SendBlockReason,
	SendValidationInput,
	SendValidationResult,
} from '../hooks/useSendValidation';
```

```bash
mkdir -p .division && echo "COMMIT_MSG written to .division/COMMIT_MSG.txt"
```