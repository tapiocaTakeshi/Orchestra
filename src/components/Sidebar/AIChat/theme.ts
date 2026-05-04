// Minimal theme tokens for the AI Chat panel.
// Centralized so colors / spacing / radii stay consistent.
export const chatTheme = {
  colors: {
    background: '#FFFFFF',
    surface: '#F7F7F8',
    surfaceAlt: '#FAFAFB',
    border: '#ECECEE',
    borderStrong: '#E0E0E3',
    textPrimary: '#1A1A1F',
    textSecondary: '#6B6B73',
    textMuted: '#9A9AA2',
    accent: '#2F6FEB',
    accentSoft: '#E8F0FE',
    bubbleUser: '#2F6FEB',
    bubbleUserText: '#FFFFFF',
    bubbleAssistant: '#F2F2F4',
    bubbleAssistantText: '#1A1A1F',
    online: '#2BB673',
    danger: '#E5484D',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    pill: 999,
  },
  font: {
    title: 15,
    body: 14,
    small: 12,
    tiny: 11,
  },
};

export type ChatRole = 'user' | 'assistant';

export interface ChatMessageItem {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}
