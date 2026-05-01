import { StyleSheet } from 'react-native';

/**
 * Minimal palette
 * - モノトーン中心
 * - アクセントは 1 色のみ
 */
export const palette = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F7F7F8',
  border: '#ECECEE',
  borderStrong: '#DDDDE1',
  text: '#111114',
  textMuted: '#6B6B72',
  placeholder: '#A1A1AA',
  muted: '#C9C9CF',
  accent: '#4F46E5', // indigo-600
  accentSoft: '#EEF0FF',
};

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.text,
    letterSpacing: 0.2,
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  clearBtnText: {
    fontSize: 12,
    color: palette.textMuted,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.6,
  },

  divider: {
    height: 1,
    backgroundColor: palette.border,
    marginHorizontal: 16,
  },

  /* List */
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    maxWidth: '100%',
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  rowAssistant: {
    justifyContent: 'flex-start',
  },

  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.accent,
    letterSpacing: 0.5,
  },

  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
  },
  bubbleAssistant: {
    backgroundColor: palette.surfaceAlt,
    borderTopLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: palette.text,
    borderTopRightRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextAssistant: {
    color: palette.text,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
  },

  /* Empty */
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.accent,
    letterSpacing: 0.5,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
  },
  emptySubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: palette.textMuted,
    textAlign: 'center',
  },

  /* Typing */
  typingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  typingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.muted,
  },
  typingDotMid: {
    opacity: 0.7,
  },
  typingText: {
    marginLeft: 6,
    fontSize: 11,
    color: palette.textMuted,
  },

  /* Input */
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  inputWrapFocused: {
    borderColor: palette.borderStrong,
    backgroundColor: palette.surface,
  },
  input: {
    flex: 1,
    minHeight: 24,
    maxHeight: 120,
    fontSize: 14,
    lineHeight: 20,
    color: palette.text,
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: palette.muted,
  },
  sendBtnPressed: {
    opacity: 0.85,
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
});
