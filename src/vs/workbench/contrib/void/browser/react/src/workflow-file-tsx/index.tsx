/*--------------------------------------------------------------------------------------
 *  .division/workflow.json diagram editor mount function
 *--------------------------------------------------------------------------------------*/

import { mountFnGenerator } from '../util/mountFnGenerator.js'
import { WorkflowFileEditor } from './WorkflowFileEditor.js'

export const mountWorkflowFileEditor = mountFnGenerator(WorkflowFileEditor)
