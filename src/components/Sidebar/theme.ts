// Minimal テーマトークン。色やサイズはここに集約し、
// 各コンポーネントから参照することで一貫したデザインを保つ。

export const chatColors = {
  // 背景
  surface: '#FFFFFF',
  surfaceMuted: '#F7F7F8',
  surfaceSunken: '#FAFAFA',

  // 線
  border: '#ECECEE',
  borderStrong: '#DCDCE0',

  // テキスト
  textPrimary: '#111114',
  textSecondary: '#5B5B66',
  textMuted: '#9A9AA5',
  textOnAccent: '#FFFFFF',

  // アクセント（Minimal: 1色のみ）
  accent: '#111114',
  accentSoft: '#1F1F25',
  accentDisabled: '#D4D4DA',

  // 状態
  online: '#22C55E',
  shadow: 'rgba(17, 17, 20, 0.06)',

  // ロール別バブル
  userBubble: '#111114',
  userBubbleText: '#FFFFFF',
  aiBubble: '#F2F2F4',
  aiBubbleText: '#111114',
} as const;

export const chatSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const chatRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const chatTypography = {
  title: { fontSize: 15, fontWeight: '600' as const, letterSpacing: 0.1 },
  subtitle: { fontSize: 11, fontWeight: '400' as const, letterSpacing: 0.2 },
  body: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  meta: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.3 },
  input: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
};
