import { StyleSheet, Platform } from 'react-native';

/**
 * Minimal design tokens
 * - 白基調 + 中間グレーのアクセント
 * - 影は使わず、細い罫線で区切る
 * - 角丸は控えめ (8〜16)
 */
export const COLORS = {
  bg: '#FFFFFF',
  surface: '#FAFAFA',
  border: '#ECECEE',
  borderStrong: '#E2E2E5',
  text: '#111114',
  subtext: '#5A5A60',
  muted: '#9A9AA2',
  placeholder: '#B5B5BC',
  accent: '#111114',
  accentText: '#FFFFFF',
  bubbleAi: '#F4F4F5',
  online: '#22C55E',
  disabled: '#D9D9DD',
};

const FONT = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'system-ui',
});

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 280,
    backgroundColor: COLORS.bg,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },

  /* Header */
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: COLORS.accentText,
    fontFamily: FONT,
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  headerTextWrap: {
    flexShrink: 1,
  },
  headerTitle: {
    color: COLORS.text,
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.online,
    marginRight: 6,
  },
  headerSubtitle: {
    color: COLORS.subtext,
    fontFamily: FONT,
    fontSize: 12,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: {
    backgroundColor: COLORS.surface,
  },
  iconBtnText: {
    fontSize: 20,
    color: COLORS.subtext,
    fontFamily: FONT,
    lineHeight: 22,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },

  /* Scroll & messages */
  scroll: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 10,
  },

  /* Empty state */
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 8,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyIconText: {
    fontSize: 20,
    color: COLORS.text,
    fontFamily: FONT,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    fontFamily: FONT,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: COLORS.subtext,
    fontFamily: FONT,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  suggestionList: {
    width: '100%',
    gap: 8,
  },
  suggestion: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  suggestionPressed: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.borderStrong,
  },
  suggestionText: {
    color: COLORS.text,
    fontFamily: FONT,
    fontSize: 13,
  },

  /* Message rows */
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAi: {
    justifyContent: 'flex-start',
  },
  miniAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 2,
  },
  miniAvatarText: {
    color: COLORS.accentText,
    fontFamily: FONT,
    fontSize: 10,
    fontWeight: '600',
  },

  /* Bubbles */
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
  },
  bubbleAi: {
    backgroundColor: COLORS.bubbleAi,
    borderTopLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: COLORS.accent,
    borderTopRightRadius: 4,
  },
  bubbleText: {
    fontFamily: FONT,
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextAi: {
    color: COLORS.text,
  },
  bubbleTextUser: {
    color: COLORS.accentText,
  },
  bubbleTime: {
    fontFamily: FONT,
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  bubbleTimeAi: {
    color: COLORS.muted,
  },
  bubbleTimeUser: {
    color: 'rgba(255,255,255,0.7)',
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typingText: {
    color: COLORS.subtext,
    fontFamily: FONT,
    fontSize: 12,
  },

  /* Composer */
  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: COLORS.bg,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontFamily: FONT,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 8,
    paddingHorizontal: 6,
    maxHeight: 120,
    minHeight: 36,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    marginBottom: 2,
  },
  sendBtnPressed: {
    opacity: 0.85,
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.disabled,
  },
  sendBtnText: {
    color: COLORS.accentText,
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  helperText: {
    marginTop: 6,
    color: COLORS.muted,
    fontFamily: FONT,
    fontSize: 11,
    textAlign: 'center',
  },
});
