// Minimal テーマトークン
// 既存テーマがある場合はここを差し替え or import に置き換えてください。
export const aiChatTheme = {
  color: {
    bg: '#FFFFFF',
    surface: '#FAFAFA',
    surfaceAlt: '#F4F4F5',
    border: '#ECECEE',
    borderStrong: '#E4E4E7',
    text: '#0F0F10',
    textMuted: '#6B7280',
    textSubtle: '#9CA3AF',
    accent: '#4F46E5',      // インディゴ
    accentSoft: '#EEF2FF',
    success: '#10B981',
    danger: '#EF4444',
    bubbleUser: '#0F0F10',
    bubbleUserText: '#FFFFFF',
    bubbleAi: '#F4F4F5',
    bubbleAiText: '#0F0F10',
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    pill: 999,
  },
  spacing: (n: number) => n * 4,
  font: {
    xs: 11,
    sm: 13,
    md: 14,
    lg: 16,
    xl: 18,
  },
};

export type AIChatTheme = typeof aiChatTheme;
