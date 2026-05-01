// Minimal theme tokens for the AI chat sidebar.
// Centralized so we never hardcode raw color literals across components.

export const ChatTheme = {
  color: {
    background: '#FFFFFF',
    backgroundMuted: '#FAFAFA',
    border: '#ECECEC',
    borderStrong: '#E0E0E0',
    text: '#111111',
    textMuted: '#6B7280',
    textSubtle: '#9CA3AF',
    accent: '#111111',        // Minimal: monochrome accent
    accentOn: '#FFFFFF',
    bubbleUser: '#111111',
    bubbleUserText: '#FFFFFF',
    bubbleAi: '#F4F4F5',
    bubbleAiText: '#111111',
    overlay: 'rgba(0,0,0,0.35)',
    danger: '#DC2626',
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
    xl: 24,
    xxl: 32,
  },
  font: {
    title: 16,
    body: 15,
    small: 13,
    tiny: 11,
  },
} as const;

export type ChatThemeType = typeof ChatTheme;
