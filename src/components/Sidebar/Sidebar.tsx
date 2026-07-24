import React from 'react';
import { View } from 'react-native';
import AIChatPanel from './AIChatPanel';

const Sidebar: React.FC = () => {
  return (
    <View>
      {/* AI Chat */}
      <AIChatPanel />
    </View>
  );
};

export default Sidebar;
