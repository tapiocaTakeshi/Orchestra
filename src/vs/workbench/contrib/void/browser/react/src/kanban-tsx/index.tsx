/*--------------------------------------------------------------------------------------
 *  Kanban Board mount function
 *--------------------------------------------------------------------------------------*/

import { mountFnGenerator } from '../util/mountFnGenerator.js'
import { KanbanBoard } from './KanbanBoard.js'

export const mountKanbanBoard = mountFnGenerator(KanbanBoard)
