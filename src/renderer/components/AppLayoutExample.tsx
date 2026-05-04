import React from 'react';
import AIChatSidebar from './AIChatSidebar';

/**
 * 既存の App / Layout に AIChatSidebar をマウントする際の参考例。
 * 既に Layout がある場合はこのファイルは無視し、
 * 既存 Layout の右端に <AIChatSidebar /> を追加してください。
 */
export const AppLayoutExample: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <div style={{ display: 'flex', height: '100vh', minHeight: 0 }}>
      <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>{children}</main>
      <AIChatSidebar />
    </div>
  );
};

export default AppLayoutExample;
