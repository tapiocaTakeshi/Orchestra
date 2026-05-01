// Minimal theme tokens for the AI chat sidebar.
// Keep tokens here so colors & spacings stay consistent across chat components.

export const chatTheme = {
  colors: {
    background: '#FFFFFF',
    surface: '#FAFAFA',
    surfaceAlt: '#F4F4F5',
    border: '#ECECEE',
    borderStrong: '#E2E2E5',
    textPrimary: '#111111',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    accent: '#111111',       // minimal: black as accent
    accentText: '#FFFFFF',
    bubbleUser: '#111111',
    bubbleUserText: '#FFFFFF',
    bubbleAi: '#F4F4F5',
    bubbleAiText: '#111111',
    danger: '#EF4444',
    online: '#10B981',
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
  },
  typography: {
    title: 16,
    body: 14,
    small: 12,
    tiny: 11,
  },
};

export type ChatTheme = typeof chatTheme;
