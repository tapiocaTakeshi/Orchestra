// AI Chat panel — Minimal theme tokens
// 既存テーマがある場合はここを薄いラッパとして差し替えてください。

export const AIChatColors = {
  background: '#FFFFFF',
  surface: '#F7F7F8',
  surfaceMuted: '#FAFAFB',
  border: '#ECECEE',
  borderStrong: '#DCDCE0',
  textPrimary: '#1F1F23',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  accent: '#1F1F23',
  accentSoft: '#111114',
  online: '#10B981',
  bubbleUser: '#1F1F23',
  bubbleUserText: '#FFFFFF',
  bubbleAssistant: '#F4F4F5',
  bubbleAssistantText: '#1F1F23',
};

export const AIChatSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const AIChatRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const AIChatTypography = {
  title: { fontSize: 15, fontWeight: '600' as const, letterSpacing: 0.1 },
  subtitle: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.4 },
  message: { fontSize: 14, fontWeight: '400' as const, lineHeight: 21 },
  meta: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.2 },
  input: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
};
