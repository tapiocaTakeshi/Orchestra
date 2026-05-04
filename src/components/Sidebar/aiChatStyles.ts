import { StyleSheet } from 'react-native';

export const COLORS = {
  bg: '#FFFFFF',
  surface: '#FAFAFA',
  border: '#ECECEC',
  borderStrong: '#111111',
  text: '#111111',
  subtle: '#4B5563',
  muted: '#9CA3AF',
  accent: '#111111',
  accentText: '#FFFFFF',
  online: '#10B981',
};

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: COLORS.accentText,
    fontSize: 14,
    fontWeight: '600',
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: 0.2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    color: COLORS.muted,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },

  /* Scroll */
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
    flexGrow: 1,
  },

  /* Empty state */
  emptyWrap: {
    flex: 1,
    paddingVertical: 24,
    alignItems: 'flex-start',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.subtle,
    marginBottom: 16,
  },
  suggestionList: {
    width: '100%',
    gap: 8,
  },
  suggestionChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.bg,
  },
  suggestionChipPressed: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.muted,
  },
  suggestionText: {
    fontSize: 13,
    color: COLORS.text,
  },

  /* Bubbles */
  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  bubbleRowStart: {
    justifyContent: 'flex-start',
  },
  bubbleRowEnd: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: COLORS.accent,
    borderTopRightRadius: 4,
  },
  bubbleText: {
    fontSize: 13,
    lineHeight: 19,
  },
  bubbleTextAssistant: {
    color: COLORS.text,
  },
  bubbleTextUser: {
    color: COLORS.accentText,
  },

  /* Typing indicator */
  typing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typingText: {
    fontSize: 12,
    color: COLORS.muted,
  },

  /* Input */
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.bg,
  },
  inputWrapFocused: {
    borderColor: COLORS.borderStrong,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 6,
    maxHeight: 120,
    minHeight: 24,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.muted,
  },
  sendBtnPressed: {
    opacity: 0.85,
  },
  sendBtnText: {
    color: COLORS.accentText,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
});
