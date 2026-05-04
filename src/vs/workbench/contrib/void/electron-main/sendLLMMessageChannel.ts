/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// registered in app.ts
// code convention is to make a service responsible for this stuff, and not a channel, but having fewer files is simpler...

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { EventLLMMessageOnTextParams, EventLLMMessageOnErrorParams, EventLLMMessageOnFinalMessageParams, EventLLMMessageOnFileOperationParams, EventLLMMessageOnCommandRunParams, MainSendLLMMessageParams, AbortRef, SendLLMMessageParams, MainLLMMessageAbortParams, MainLLMMessageInterjectParams, ModelListParams, EventModelListOnSuccessParams, EventModelListOnErrorParams, OllamaModelResponse, OpenaiCompatibleModelResponse, MainModelListParams, DivisionAPIModelResponse, } from '../common/sendLLMMessageTypes.js';
import { sendLLMMessage } from './llmMessage/sendLLMMessage.js'
import { IMetricsService } from '../common/metricsService.js';
import { sendLLMMessageToProviderImplementation } from './llmMessage/sendLLMMessage.impl.js';
import * as fs from 'fs';
import * as path from 'path';

// NODE IMPLEMENTATION - calls actual sendLLMMessage() and returns listeners to it

export class LLMMessageChannel implements IServerChannel {

	// sendLLMMessage
	private readonly llmMessageEmitters = {
		onText: new Emitter<EventLLMMessageOnTextParams>(),
		onFinalMessage: new Emitter<EventLLMMessageOnFinalMessageParams>(),
		onError: new Emitter<EventLLMMessageOnErrorParams>(),
		onFileOperation: new Emitter<EventLLMMessageOnFileOperationParams>(),
		onCommandRun: new Emitter<EventLLMMessageOnCommandRunParams>(),
	}

	// aborters for above
	private readonly _infoOfRunningRequest: Record<string, { waitForSend: Promise<void> | undefined, abortRef: AbortRef }> = {}

	// ユーザー割り込みメッセージの保留キュー（requestId ごと）。
	// renderer 側で実行中にチャットを送信されたとき、abort せずにここへ積む。
	// main 側の orchestration loop は各フェーズの境目で pop して取り込む。
	private readonly _pendingInjections: Record<string, string[]> = {}


	// list
	private readonly listEmitters = {
		ollama: {
			success: new Emitter<EventModelListOnSuccessParams<OllamaModelResponse>>(),
			error: new Emitter<EventModelListOnErrorParams<OllamaModelResponse>>(),
		},
		openaiCompat: {
			success: new Emitter<EventModelListOnSuccessParams<OpenaiCompatibleModelResponse>>(),
			error: new Emitter<EventModelListOnErrorParams<OpenaiCompatibleModelResponse>>(),
		},
		divisionAPI: {
			success: new Emitter<EventModelListOnSuccessParams<DivisionAPIModelResponse>>(),
			error: new Emitter<EventModelListOnErrorParams<DivisionAPIModelResponse>>(),
		},
	} satisfies {
		[providerName in 'ollama' | 'openaiCompat' | 'divisionAPI']: {
			success: Emitter<EventModelListOnSuccessParams<any>>,
			error: Emitter<EventModelListOnErrorParams<any>>,
		}
	}

	// stupidly, channels can't take in @IService
	constructor(
		private readonly metricsService: IMetricsService,
	) { }

	// browser uses this to listen for changes
	listen(_: unknown, event: string): Event<any> {
		// text
		if (event === 'onText_sendLLMMessage') return this.llmMessageEmitters.onText.event;
		else if (event === 'onFinalMessage_sendLLMMessage') return this.llmMessageEmitters.onFinalMessage.event;
		else if (event === 'onError_sendLLMMessage') return this.llmMessageEmitters.onError.event;
		else if (event === 'onFileOperation_sendLLMMessage') return this.llmMessageEmitters.onFileOperation.event;
		else if (event === 'onCommandRun_sendLLMMessage') return this.llmMessageEmitters.onCommandRun.event;
		// list
		else if (event === 'onSuccess_list_ollama') return this.listEmitters.ollama.success.event;
		else if (event === 'onError_list_ollama') return this.listEmitters.ollama.error.event;
		else if (event === 'onSuccess_list_openAICompatible') return this.listEmitters.openaiCompat.success.event;
		else if (event === 'onError_list_openAICompatible') return this.listEmitters.openaiCompat.error.event;
		else if (event === 'onSuccess_list_divisionAPI') return this.listEmitters.divisionAPI.success.event;
		else if (event === 'onError_list_divisionAPI') return this.listEmitters.divisionAPI.error.event;

		else throw new Error(`Event not found: ${event}`);
	}

	// browser uses this to call (see this.channel.call() in llmMessageService.ts for all usages)
	async call(_: unknown, command: string, params: any): Promise<any> {
		try {
			if (command === 'sendLLMMessage') {
				this._callSendLLMMessage(params)
			}
			else if (command === 'abort') {
				await this._callAbort(params)
			}
			else if (command === 'interjectMessage') {
				this._callInterject(params)
			}
			else if (command === 'ollamaList') {
				this._callOllamaList(params)
			}
			else if (command === 'openAICompatibleList') {
				this._callOpenAICompatibleList(params)
			}
			else if (command === 'divisionAPIList') {
				this._callDivisionAPIList(params)
			}
			else if (command === 'approveOrchestration') {
				this._callApproveOrchestration(params)
			}
			else {
				throw new Error(`Void sendLLM: command "${command}" not recognized.`)
			}
		}
		catch (e) {
			console.log('llmMessageChannel: Call Error:', e)
		}
	}

	// the only place sendLLMMessage is actually called
	private _callSendLLMMessage(params: MainSendLLMMessageParams) {
		const { requestId } = params;

		if (!(requestId in this._infoOfRunningRequest))
			this._infoOfRunningRequest[requestId] = { waitForSend: undefined, abortRef: { current: null } }

		const mainThreadParams: SendLLMMessageParams = {
			...params,
			onText: (p) => {
				this.llmMessageEmitters.onText.fire({ requestId, ...p });
			},
			onFinalMessage: (p) => {
				this.llmMessageEmitters.onFinalMessage.fire({ requestId, ...p });
			},
			onError: (p) => {
				console.log('sendLLM: firing err');
				this.llmMessageEmitters.onError.fire({ requestId, ...p });
			},
			onFileOperation: (operations) => {
				this.llmMessageEmitters.onFileOperation.fire({ requestId, operations });
			},
			onCommandRun: (commands) => {
				this.llmMessageEmitters.onCommandRun.fire({ requestId, commands });
			},
			abortRef: this._infoOfRunningRequest[requestId].abortRef,
			// orchestration loop から「今たまっている割り込みをください」と呼ばれる。
			// 1回呼ぶと配列は空になるので、取りこぼしなく消費できる。
			takePendingInjection: () => {
				const arr = this._pendingInjections[requestId];
				if (!arr || arr.length === 0) return null;
				const merged = arr.join('\n\n');
				this._pendingInjections[requestId] = [];
				return merged;
			},
		}
		const p = sendLLMMessage(mainThreadParams, this.metricsService);
		this._infoOfRunningRequest[requestId].waitForSend = p
	}

	private async _callAbort(params: MainLLMMessageAbortParams) {
		const { requestId } = params;
		if (!(requestId in this._infoOfRunningRequest)) return
		const { waitForSend, abortRef } = this._infoOfRunningRequest[requestId]
		await waitForSend // wait for the send to finish so we know abortRef was set
		abortRef?.current?.()
		delete this._infoOfRunningRequest[requestId]
		delete this._pendingInjections[requestId]
	}

	private _callInterject(params: MainLLMMessageInterjectParams) {
		const { requestId, text } = params;
		if (!text || !text.trim()) return;
		// 実行中の request が無いなら無視（abort 直後などの競合回避）
		if (!(requestId in this._infoOfRunningRequest)) return;
		if (!this._pendingInjections[requestId]) this._pendingInjections[requestId] = [];
		this._pendingInjections[requestId].push(text);
	}





	_callOllamaList = (params: MainModelListParams<OllamaModelResponse>) => {
		const { requestId } = params
		const emitters = this.listEmitters.ollama
		const mainThreadParams: ModelListParams<OllamaModelResponse> = {
			...params,
			onSuccess: (p) => { emitters.success.fire({ requestId, ...p }); },
			onError: (p) => { emitters.error.fire({ requestId, ...p }); },
		}
		sendLLMMessageToProviderImplementation.ollama.list(mainThreadParams as any)
	}

	_callOpenAICompatibleList = (params: MainModelListParams<OpenaiCompatibleModelResponse>) => {
		const { requestId, providerName } = params
		const emitters = this.listEmitters.openaiCompat
		const mainThreadParams: ModelListParams<OpenaiCompatibleModelResponse> = {
			...params,
			onSuccess: (p) => { emitters.success.fire({ requestId, ...p }); },
			onError: (p) => { emitters.error.fire({ requestId, ...p }); },
		}
		sendLLMMessageToProviderImplementation[providerName].list(mainThreadParams as any)
	}

	_callDivisionAPIList = (params: MainModelListParams<DivisionAPIModelResponse>) => {
		const { requestId } = params
		const emitters = this.listEmitters.divisionAPI
		const mainThreadParams: ModelListParams<DivisionAPIModelResponse> = {
			...params,
			onSuccess: (p) => { emitters.success.fire({ requestId, ...p }); },
			onError: (p) => { emitters.error.fire({ requestId, ...p }); },
		}
		sendLLMMessageToProviderImplementation.divisionAPI.list?.(mainThreadParams as any)
	}

	private _callApproveOrchestration(params: { editedOutputs?: Array<{ mdFileName: string; mdContent: string }>; workspaceFolderPath?: string }) {
		const { editedOutputs, workspaceFolderPath } = params;
		if (!workspaceFolderPath) return;

		const stateFile = path.join(workspaceFolderPath, '.division', '.orchestration-state.json');
		try {
			if (!fs.existsSync(stateFile)) return;
			const raw = fs.readFileSync(stateFile, 'utf-8');
			const state = JSON.parse(raw);
			state.approved = true;
			if (editedOutputs) state.editedOutputs = editedOutputs;
			fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
		} catch (_e) { /* ignore */ }
	}


}
