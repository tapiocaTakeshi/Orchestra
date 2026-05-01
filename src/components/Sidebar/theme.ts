// Minimal テーマトークン。既存のテーマがある場合はここを薄いラッパーに置き換える。
export const sidebarTheme = {
  colors: {
    bg: '#FFFFFF',
    surface: '#FAFAFA',
    surfaceMuted: '#F4F4F5',
    border: '#ECECEC',
    borderStrong: '#D4D4D8',
    text: '#111111',
    textMuted: '#6B7280',
    textSubtle: '#9CA3AF',
    accent: '#111111',
    bubbleUser: '#F2F2F2',
    bubbleAssistant: 'transparent',
    placeholder: '#B5B5B5',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 8,
    md: 10,
    lg: 14,
    pill: 999,
  },
  font: {
    title: 15,
    body: 14,
    small: 12,
    micro: 11,
  },
} as const;

export type SidebarTheme = typeof sidebarTheme;
