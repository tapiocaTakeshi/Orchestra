import { StyleSheet } from 'react-native';

/**
 * Minimal palette: モノトーン + 1 アクセント
 */
export const palette = {
  bg: '#FFFFFF',
  surface: '#FAFAFA',
  surfaceAlt: '#F4F4F5',
  border: '#ECECEE',
  text: '#111114',
  subText: '#52525B',
  muted: '#A1A1AA',
  accent: '#111114', // ミニマル: 黒をアクセントに
  accentText: '#FFFFFF',
  online: '#22C55E',
  userBubble: '#111114',
  aiBubble: '#F4F4F5',
};

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  flex: { flex: 1 },

  /* Header */
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.bg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: palette.accentText,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.online,
  },
  statusText: {
    fontSize: 11,
    color: palette.subText,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonPressed: {
    backgroundColor: palette.surfaceAlt,
  },
  iconGlyph: {
    fontSize: 16,
    color: palette.subText,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
  },

  /* Messages */
  messagesWrap: { flex: 1 },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  msgSpacer: { height: 14 },

  msgRow: {
    width: '100%',
  },
  msgRowUser: { alignItems: 'flex-end' },
  msgRowAi: { alignItems: 'flex-start' },

  roleLabel: {
    fontSize: 11,
    color: palette.muted,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  roleLabelUser: {
    textAlign: 'right',
  },

  msgBody: {
    maxWidth: '88%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  msgBodyUser: {
    backgroundColor: palette.userBubble,
    borderTopRightRadius: 4,
  },
  msgBodyAi: {
    backgroundColor: palette.aiBubble,
    borderTopLeftRadius: 4,
  },
  msgText: {
    fontSize: 14,
    lineHeight: 20,
  },
  msgTextUser: {
    color: palette.accentText,
  },
  msgTextAi: {
    color: palette.text,
  },

  systemRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  systemText: {
    fontSize: 11,
    color: palette.muted,
  },

  thinkingRow: {
    marginTop: 14,
    alignItems: 'flex-start',
  },

  /* Empty state */
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.text,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    lineHeight: 20,
    color: palette.subText,
    textAlign: 'center',
  },

  /* Composer */
  composerWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    backgroundColor: palette.bg,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: palette.surface,
    borderRadius: 18,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  input: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: palette.text,
    maxHeight: 120,
    paddingTop: 8,
    paddingBottom: 8,
    paddingRight: 8,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    marginBottom: 2,
  },
  sendButtonDisabled: {
    backgroundColor: palette.surfaceAlt,
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
  sendGlyph: {
    color: palette.accentText,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  sendGlyphDisabled: {
    color: palette.muted,
  },
  hint: {
    marginTop: 6,
    marginLeft: 4,
    fontSize: 10,
    color: palette.muted,
  },
});
