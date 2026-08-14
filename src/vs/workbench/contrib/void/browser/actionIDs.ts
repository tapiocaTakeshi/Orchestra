// Normally you'd want to put these exports in the files that register them, but if you do that you'll get an import order error if you import them in certain cases.
// (importing them runs the whole file to get the ID, causing an import error). I guess it's best practice to separate out IDs, pretty annoying...

export const VOID_CTRL_L_ACTION_ID = 'void.ctrlLAction'

export const VOID_CTRL_K_ACTION_ID = 'void.ctrlKAction'

export const VOID_ACCEPT_DIFF_ACTION_ID = 'void.acceptDiff'

export const VOID_REJECT_DIFF_ACTION_ID = 'void.rejectDiff'

export const VOID_GOTO_NEXT_DIFF_ACTION_ID = 'void.goToNextDiff'

export const VOID_GOTO_PREV_DIFF_ACTION_ID = 'void.goToPrevDiff'

export const VOID_GOTO_NEXT_URI_ACTION_ID = 'void.goToNextUri'

export const VOID_GOTO_PREV_URI_ACTION_ID = 'void.goToPrevUri'

export const VOID_ACCEPT_FILE_ACTION_ID = 'void.acceptFile'

export const VOID_REJECT_FILE_ACTION_ID = 'void.rejectFile'

export const VOID_ACCEPT_ALL_DIFFS_ACTION_ID = 'void.acceptAllDiffs'

export const VOID_REJECT_ALL_DIFFS_ACTION_ID = 'void.rejectAllDiffs'

// Editor の赤波線(エラー/警告)上で表示する Quick Fix「Fix with Agent」のコマンドID。
// 押すと該当エラーの内容と周辺コードをチャットへ転送して即ストリーミングを開始する。
export const VOID_FIX_WITH_AGENT_ACTION_ID = 'void.fixWithAgent'

// 内蔵カンバン (.orchestra/kanban.json のタスクをボードで管理し、エージェントに流す)
export const VOID_TOGGLE_KANBAN_ACTION_ID = 'void.kanban.toggleBoard'
export const VOID_OPEN_KANBAN_ACTION_ID = 'void.kanban.openBoard'
export const VOID_OPEN_KANBAN_IN_NEW_WINDOW_ACTION_ID = 'void.kanban.openBoardInNewWindow'
export const VOID_KANBAN_ADD_TASK_ACTION_ID = 'void.kanban.addTask'
export const VOID_KANBAN_RUN_NEXT_ACTION_ID = 'void.kanban.runNext'
export const VOID_KANBAN_TOGGLE_AUTO_RUN_ACTION_ID = 'void.kanban.toggleAutoRun'
export const VOID_KANBAN_CANCEL_ACTION_ID = 'void.kanban.cancelCurrent'

// Trello 連携 (Trello の TODO カードをプロンプトとして自動実行する)
export const VOID_TRELLO_RUN_NOW_ACTION_ID = 'void.trello.runNow'
export const VOID_TRELLO_TOGGLE_AUTO_RUN_ACTION_ID = 'void.trello.toggleAutoRun'
export const VOID_TRELLO_CANCEL_ACTION_ID = 'void.trello.cancelCurrent'
