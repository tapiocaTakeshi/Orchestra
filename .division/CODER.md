コミットメッセージを生成し、ファイルとして保存しつつ `git commit` も実行できるようにします。変更の主眼は **SidebarChat の UX 改善 Phase 1/2（送信バリデーション・プレビュー・tool 折りたたみ）新規コンポーネント群の追加**、**モデルドロップダウンのグルーピング対応**、および **division ロールドキュメント一式の刷新** の3点です。

```txt:.git/COMMIT_EDITMSG_DRAFT
feat(sidebar-chat): add send validation, preview modal, and collapsible tool blocks

Implement Phase 1 and Phase 2 of the SidebarChat UX improvement plan
produced by the division agents (ideaman -> planner -> designer -> coder).

Sidebar chat (new components)
- hooks/useSendValidation.ts: central send-guard logic returning a typed
  SendBlockReason (empty / too-long / in-flight / indexing / no-model /
  attachment-uploading) with localized, actionable messages.
- components/DisableReason.tsx: inline, ARIA-live status banner that
  surfaces *why* sending is blocked and how to recover (H1 / idea #4).
- components/SendPreviewModal.tsx: pre-send confirmation dialog with
  focus trap, Esc to cancel and Cmd/Ctrl+Enter to confirm, preventing
  accidental sends while preserving the draft (H2 / idea #6).
- components/ChatInput.tsx: composed input wiring validation, preview,
  attachments, char counter, Enter/Shift+Enter, and Esc-to-cancel while
  streaming; fully themed via --void-* / VS Code tokens.
- components/ToolCallBlock.tsx: collapsible tool-call card with
  auto-collapse heuristics (line/char thresholds), status icon, and
  summary hint in the header (H3 / ideas #13, M7).
- components/{index.ts,README.md}: barrel export + integration notes.

Model picker
- util/inputs.tsx (VoidCustomDropdownBox): add optional
  getOptionGroupName to render sticky, non-selectable group headers for
  adjacent options sharing a group; existing call sites unaffected.
- void-settings-tsx/ModelDropdown.tsx, Settings.tsx: adopt grouped
  rendering for provider/model listings.

LLM message plumbing
- common/sendLLMMessageTypes.ts, voidSettingsTypes.ts,
  sendLLMMessageService.ts and electron-main/llmMessage/*: minor
  additions to carry the new settings/metadata required by the updated
  send path.

Division docs
- .division/{CODER,IDEAMAN,PLANNING,RESEARCH,REVIEW,SEARCH,
  FILE-SEARCH}.md and DESIGNER.html: rewrite each role's deliverable so
  CODER.md contains the actual component specs, IDEAMAN.md prioritizes
  proposals by impact/effort, PLANNING.md maps ideas to phases, and
  DESIGNER.html / RESEARCH.md / SEARCH.md provide the supporting
  rationale and citations that previous reviews flagged as missing.

No existing runtime wiring is removed; new components are standalone
and opt-in from SidebarChat.
```

```bash
git add -A && git commit -F .git/COMMIT_EDITMSG_DRAFT
```