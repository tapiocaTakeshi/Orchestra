import { StyleSheet } from 'react-native';

/** Minimal デザイン用のカラートークン */
export const palette = {
  bg: '#FFFFFF',
  bgSubtle: '#FAFAFA',
  border: '#ECECEE',
  borderStrong: '#E2E2E5',
  text: '#1A1A1F',
  textSubtle: '#5B5B66',
  textMuted: '#9A9AA3',
  accent: '#2F6FEB',
  accentText: '#FFFFFF',
  bubbleUserBg: '#1A1A1F',
  bubbleUserText: '#FFFFFF',
  bubbleAIBg: '#F5F5F7',
  bubbleAIText: '#1A1A1F',
};

const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
    marginRight: space.sm,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
    letterSpacing: 0.2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: space.xs,
  },
  iconBtnPressed: {
    backgroundColor: palette.bgSubtle,
  },
  iconGlyph: {
    fontSize: 18,
    color: palette.textSubtle,
    lineHeight: 20,
  },

  divider: {
    height: 1,
    backgroundColor: palette.border,
    marginHorizontal: space.lg,
  },

  /* List */
  listContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },

  /* Bubble */
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: space.lg,
    alignItems: 'flex-end',
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubbleRowAI: {
    justifyContent: 'flex-start',
  },
  bubbleColumn: {
    maxWidth: '82%',
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: palette.bgSubtle,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.sm,
  },
  avatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.textSubtle,
    letterSpacing: 0.5,
  },
  bubble: {
    paddingVertical: space.md - 2,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.lg,
  },
  bubbleUser: {
    backgroundColor: palette.bubbleUserBg,
    borderTopRightRadius: radius.sm,
  },
  bubbleAI: {
    backgroundColor: palette.bubbleAIBg,
    borderTopLeftRadius: radius.sm,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: palette.bubbleUserText,
  },
  bubbleTextAI: {
    color: palette.bubbleAIText,
  },
  timestamp: {
    fontSize: 10,
    color: palette.textMuted,
    marginTop: space.xs,
  },
  timestampLeft: {
    textAlign: 'left',
    marginLeft: space.xs,
  },
  timestampRight: {
    textAlign: 'right',
    marginRight: space.xs,
  },

  /* Typing */
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingText: {
    marginLeft: space.sm,
    fontSize: 13,
    color: palette.textSubtle,
  },

  /* Empty state */
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  emptyBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: palette.bgSubtle,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  emptyBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.textSubtle,
    letterSpacing: 0.6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.text,
    marginBottom: space.xs,
  },
  emptySubtitle: {
    fontSize: 13,
    color: palette.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: space.xl,
    maxWidth: 280,
  },
  suggestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  suggestChip: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    backgroundColor: palette.bg,
    marginRight: space.sm,
    marginBottom: space.sm,
  },
  suggestChipPressed: {
    backgroundColor: palette.bgSubtle,
  },
  suggestChipText: {
    fontSize: 12,
    color: palette.textSubtle,
  },

  /* Composer */
  composerWrap: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.lg,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.bg,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: palette.bgSubtle,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.lg,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  input: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: palette.text,
    maxHeight: 120,
    paddingVertical: space.xs,
    paddingHorizontal: 0,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: space.sm,
  },
  sendBtnPressed: {
    opacity: 0.85,
  },
  sendBtnDisabled: {
    backgroundColor: palette.borderStrong,
  },
  sendGlyph: {
    color: palette.accentText,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  sendGlyphDisabled: {
    color: palette.bg,
  },
  footnote: {
    marginTop: space.sm,
    fontSize: 11,
    color: palette.textMuted,
    textAlign: 'center',
  },
});
