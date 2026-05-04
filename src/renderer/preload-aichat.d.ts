/**
 * Electron preload で公開する AI チャット用 IPC ブリッジの型。
 * preload 側で contextBridge.exposeInMainWorld('electronAPI', {...}) してください。
 *
 * 実装例（preload.ts）:
 *   contextBridge.exposeInMainWorld('electronAPI', {
 *     chat: {
 *       send: (payload) => ipcRenderer.invoke('ai:chat:send', payload),
 *       stream: (payload, onChunk) => new Promise((resolve, reject) => {
 *         const id = crypto.randomUUID();
 *         const onData = (_e, p) => p.id === id && onChunk(p.delta);
 *         const onEnd  = (_e, p) => { if (p.id === id) { cleanup(); resolve(); } };
 *         const onErr  = (_e, p) => { if (p.id === id) { cleanup(); reject(new Error(p.message)); } };
 *         const cleanup = () => {
 *           ipcRenderer.off('ai:chat:data', onData);
 *           ipcRenderer.off('ai:chat:end',  onEnd);
 *           ipcRenderer.off('ai:chat:error',onErr);
 *         };
 *         ipcRenderer.on('ai:chat:data', onData);
 *         ipcRenderer.on('ai:chat:end',  onEnd);
 *         ipcRenderer.on('ai:chat:error',onErr);
 *         ipcRenderer.send('ai:chat:stream', { id, payload });
 *       }),
 *     },
 *   });
 */
import type { ChatMessage } from './components/aiChat/types';

export interface ElectronChatAPI {
  send?: (payload: { messages: ChatMessage[] }) => Promise<string>;
  stream?: (
    payload: { messages: ChatMessage[] },
    onChunk: (delta: string) => void
  ) => Promise<void>;
}

export interface ElectronAPI {
  chat: ElectronChatAPI;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
