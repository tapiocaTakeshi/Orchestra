import type { ChatMessage } from './components/ChatSidebar.types';

declare global {
  interface Window {
    electronAPI?: {
      /**
       * メイン プロセス側で実装される AI チャット呼び出し IPC。
       * preload.ts で contextBridge.exposeInMainWorld('electronAPI', { chat }) として公開する想定。
       */
      chat?: (payload: {
        input: string;
        history: ChatMessage[];
      }) => Promise<string>;
    };
  }
}

export {};
