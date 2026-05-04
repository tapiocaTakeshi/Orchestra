// Minimal テーマ用のトークン
// 余白を活かしたシンプルな配色・スペーシング・タイポグラフィ
export const colors = {
  bg: '#FFFFFF',
  surface: '#FAFAFA',
  surfaceAlt: '#F4F4F5',
  border: '#E5E7EB',
  borderStrong: '#D4D4D8',
  text: '#111827',
  textMuted: '#6B7280',
  textSubtle: '#9CA3AF',
  accent: '#4F46E5',     // Indigo 600
  accentSoft: '#EEF2FF', // Indigo 50
  accentText: '#FFFFFF',
  online: '#10B981',
  danger: '#EF4444',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
};

export const typography = {
  title: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  subtitle: { fontSize: 12, fontWeight: '400' as const, color: colors.textMuted },
  body: { fontSize: 14, fontWeight: '400' as const, color: colors.text, lineHeight: 20 },
  caption: { fontSize: 11, fontWeight: '500' as const, color: colors.textSubtle, letterSpacing: 0.4 },
};
