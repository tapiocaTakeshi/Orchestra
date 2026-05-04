// Minimal design tokens for the AI chat sidebar.
// Keep palette grayscale-first with a single accent.

export const chatTheme = {
  color: {
    // Surfaces
    background: '#FFFFFF',
    surface: '#FAFAFA',
    surfaceMuted: '#F3F4F6',
    overlay: 'rgba(17, 17, 17, 0.04)',

    // Borders
    border: '#ECECEE',
    borderStrong: '#E2E2E5',

    // Text
    textPrimary: '#111111',
    textSecondary: '#6B7280',
    textTertiary: '#9CA3AF',
    textOnAccent: '#FFFFFF',

    // Accent (single, restrained)
    accent: '#111111',
    accentMuted: '#1F2937',

    // States
    online: '#10B981',
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    pill: 999,
    bubble: 18,
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
    micro: 11,
  },
};

export type ChatTheme = typeof chatTheme;
