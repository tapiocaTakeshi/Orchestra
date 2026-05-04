import { StyleSheet, Platform } from 'react-native';
import { tokens } from '../../theme/tokens';

const { color, space, radius, font } = tokens;

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: color.surface,
  },

  /* ---------- Header ---------- */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
    backgroundColor: color.surface,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.bgMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMark: {
    fontSize: 12,
    fontWeight: '600',
    color: color.text,
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: font.md,
    fontWeight: '600',
    color: color.text,
    lineHeight: 20,
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
    backgroundColor: '#22C55E',
  },
  statusText: {
    fontSize: font.xs,
    color: color.textMuted,
  },
  headerAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bgMuted,
  },
  headerActionText: {
    fontSize: 18,
    color: color.text,
    lineHeight: 20,
  },

  /* ---------- Messages ---------- */
  messages: { flex: 1 },
  messagesContent: {
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    gap: space.md,
  },
  messagesContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  bubbleRow: { width: '100%', flexDirection: 'row' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAssistant: { justifyContent: 'flex-start' },

  bubble: {
    maxWidth: '88%',
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: radius.lg,
  },
  userBubble: {
    backgroundColor: color.accent,
    borderTopRightRadius: 6,
  },
  assistantBubble: {
    backgroundColor: color.bgMuted,
    borderTopLeftRadius: 6,
  },
  roleLabel: {
    fontSize: font.xs,
    color: color.textMuted,
    marginBottom: 4,
    fontWeight: '500',
  },
  bubbleText: {
    fontSize: font.md,
    lineHeight: 22,
  },
  userText: { color: color.onAccent },
  assistantText: { color: color.text },

  /* ---------- Empty state ---------- */
  empty: { alignItems: 'center', paddingHorizontal: space.lg, gap: space.sm },
  emptyTitle: {
    fontSize: font.lg,
    fontWeight: '600',
    color: color.text,
  },
  emptySubtitle: {
    fontSize: font.sm,
    color: color.textMuted,
    textAlign: 'center',
    marginBottom: space.md,
  },
  suggestionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    justifyContent: 'center',
  },
  suggestionChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 999,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  suggestionText: {
    fontSize: font.sm,
    color: color.text,
  },

  /* ---------- Composer ---------- */
  composerWrap: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    backgroundColor: color.bgMuted,
    borderRadius: 999,
    paddingHorizontal: space.md,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
  },
  input: {
    flex: 1,
    fontSize: font.md,
    lineHeight: 22,
    color: color.text,
    maxHeight: 120,
    paddingVertical: 8,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : null),
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: color.border,
  },
  sendIcon: {
    color: color.onAccent,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  hint: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 11,
    color: color.textMuted,
  },
});
