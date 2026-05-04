// Minimal theme tokens for the sidebar AI chat.
// Keep palette restrained: near-black ink, off-white surfaces, single accent.

export const sidebarChatTheme = {
  colors: {
    surface: '#FFFFFF',
    surfaceMuted: '#FAFAFA',
    surfaceSunken: '#F4F4F5',
    border: '#ECECEC',
    borderStrong: '#D9D9DC',
    ink: '#111114',
    inkMuted: '#6B6B72',
    inkSubtle: '#9A9AA1',
    accent: '#111114',     // monochrome accent for "Send"
    accentInk: '#FFFFFF',
    bubbleUser: '#111114',
    bubbleUserInk: '#FFFFFF',
    bubbleAi: '#F4F4F5',
    bubbleAiInk: '#111114',
    danger: '#C0392B',
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    pill: 999,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
  font: {
    title: 14,
    body: 14,
    meta: 11,
  },
} as const;

export type SidebarChatTheme = typeof sidebarChatTheme;
