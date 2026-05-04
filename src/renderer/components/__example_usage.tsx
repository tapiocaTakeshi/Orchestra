// このファイルは利用例です。実プロジェクトでは App.tsx / Layout 側に組み込んでください。
import React, { useState } from 'react';
import ChatSidebar from './ChatSidebar';

export const ExampleLayout: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{ display: 'flex', height: '100vh', minHeight: 0 }}>
      <main style={{ flex: 1, overflow: 'auto' }}>{children}</main>
      <ChatSidebar
        collapsed={collapsed}
        onToggleCollapsed={setCollapsed}
      />
    </div>
  );
};
