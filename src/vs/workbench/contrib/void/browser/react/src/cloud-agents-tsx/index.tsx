/*--------------------------------------------------------------------------------------
 *  Cloud Agents panel mount function
 *--------------------------------------------------------------------------------------*/

import { mountFnGenerator } from '../util/mountFnGenerator.js'
import { CloudAgentsPanel } from './CloudAgentsPanel.js'

export const mountCloudAgents = mountFnGenerator(CloudAgentsPanel)
