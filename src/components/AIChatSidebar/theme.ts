// Minimal design tokens for the AI chat sidebar.
// Keep the palette nearly monochrome; rely on whitespace and typography
// to create hierarchy rather than heavy color usage.

export const colors = {
  background: '#FFFFFF',
  surface: '#FAFAFA',
  surfaceAlt: '#F4F4F5',
  border: '#ECECEE',
  borderStrong: '#E2E2E5',
  textPrimary: '#0F0F11',
  textSecondary: '#6B6B72',
  textMuted: '#9A9AA1',
  accent: '#0F0F11',        // monochrome accent (used as user bubble)
  accentOn: '#FFFFFF',
  online: '#22C55E',
  shadow: 'rgba(15, 15, 17, 0.06)',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  title: {
    fontSize: 15,
    fontWeight: '600' as const,
    letterSpacing: 0.1,
  },
  caption: {
    fontSize: 11,
    fontWeight: '500' as const,
    letterSpacing: 0.4,
  },
  body: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  bodyStrong: {
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeight: 20,
  },
  meta: {
    fontSize: 10,
    fontWeight: '500' as const,
    letterSpacing: 0.4,
  },
} as const;
