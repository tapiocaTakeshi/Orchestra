// AI チャットサイドバー専用のミニマルテーマトークン
// 既存のグローバルテーマがある場合はそちらを優先し、必要に応じて差し替えてください。

export const aiChatTheme = {
  colors: {
    background: '#FFFFFF',
    surface: '#FAFAFA',
    surfaceAlt: '#F4F4F5',
    border: '#ECECEE',
    divider: '#F1F1F3',
    textPrimary: '#111114',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    accent: '#111114',         // ミニマル: ほぼ黒をアクセントに
    accentSoft: '#EFEFF1',
    bubbleUser: '#111114',
    bubbleUserText: '#FFFFFF',
    bubbleAi: '#F4F4F5',
    bubbleAiText: '#111114',
    danger: '#EF4444',
    overlay: 'rgba(17,17,20,0.32)',
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    pill: 999,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  font: {
    title: 16,
    body: 14,
    small: 12,
    tiny: 11,
  },
};

export type AIChatTheme = typeof aiChatTheme;
