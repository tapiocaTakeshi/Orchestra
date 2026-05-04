/**
 * Minimal theme tokens.
 * 既存に theme があればこのファイルを参考に統合してください。
 */
export const tokens = {
  color: {
    surface: '#FFFFFF',
    bgMuted: '#F4F5F7',
    border: '#E5E7EB',
    text: '#0F172A',
    textMuted: '#64748B',
    accent: '#0F172A',
    onAccent: '#FFFFFF',
  },
  space: {
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
    xs: 12,
    sm: 13,
    md: 15,
    lg: 18,
    xl: 22,
  },
} as const;

export type Tokens = typeof tokens;
