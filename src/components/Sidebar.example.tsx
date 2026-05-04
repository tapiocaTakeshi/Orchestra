import React from 'react';
import { View } from 'react-native';
import { AIChatSidebar } from './AIChatSidebar';

/**
 * 既存の Sidebar コンポーネント内、AI チャット領域を
 * <AIChatSidebar /> に差し替えてください。
 * props:
 *   - messages / onSend を渡せば外部 state で制御
 *   - 何も渡さなければ内部 state で動作（デモ用エコー応答）
 */
export const SidebarAIChatSection: React.FC = () => {
  return (
    <View style={{ flex: 1 }}>
      <AIChatSidebar
        title="AI アシスタント"
        subtitle="オンライン"
        // messages={messages}
        // onSend={async (text) => { /* call your API */ }}
      />
    </View>
  );
};
