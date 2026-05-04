// Minimal theme tokens for the AI chat panel.
// Keep this file framework-agnostic so it can be reused by other sidebar parts.

export const aiChatColors = {
  // surfaces
  surface: '#FFFFFF',
  surfaceMuted: '#FAFAFA',
  surfaceSunken: '#F4F4F5',

  // text
  textPrimary: '#0A0A0A',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  textOnAccent: '#FFFFFF',

  // lines / borders
  border: '#ECECEE',
  borderStrong: '#E4E4E7',

  // accent (kept neutral / near-black for the minimal look)
  accent: '#111111',
  accentPressed: '#000000',

  // states
  bubbleUserBg: '#111111',
  bubbleUserText: '#FFFFFF',
  bubbleAiBg: '#FFFFFF',
  bubbleAiText: '#0A0A0A',
  bubbleAiBorder: '#ECECEE',

  // misc
  divider: '#F0F0F2',
  shadow: 'rgba(0,0,0,0.04)',
} as const;

export const aiChatSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const aiChatRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const aiChatTypography = {
  title: {
    fontSize: 15,
    fontWeight: '600' as const,
    letterSpacing: 0.1,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '400' as const,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  meta: {
    fontSize: 11,
    fontWeight: '500' as const,
    letterSpacing: 0.4,
  },
} as const;
