import { StyleSheet } from 'react-native';

/**
 * Minimal design tokens for the AI chat sidebar.
 * - 余白を多めに、線は1pxの薄いグレー、塗りはモノトーン中心
 * - アクセントは黒に近い濃グレー1色のみ
 */
const palette = {
  bg: '#FFFFFF',
  surface: '#FAFAFA',
  border: '#ECECEE',
  text: '#1A1A1A',
  textSub: '#6B7280',
  textMuted: '#9AA0A6',
  accent: '#111111',
  accentText: '#FFFFFF',
  online: '#22C55E',
};

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.bg,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.online,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 11,
    color: palette.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    backgroundColor: palette.border,
    marginHorizontal: 20,
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },

  // Message row
  msgRow: {
    marginBottom: 18,
    maxWidth: '100%',
  },
  msgRowUser: {
    alignItems: 'flex-end',
  },
  msgRowAssistant: {
    alignItems: 'flex-start',
  },
  roleLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    color: palette.textMuted,
    marginBottom: 6,
    marginLeft: 4,
  },

  // Bubble
  bubble: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    maxWidth: '88%',
  },
  bubbleUser: {
    backgroundColor: palette.accent,
    borderTopRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: palette.bg,
    borderWidth: 1,
    borderColor: palette.border,
    borderTopLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: palette.accentText,
  },
  bubbleTextAssistant: {
    color: palette.text,
  },

  // Timestamp
  timestamp: {
    fontSize: 10,
    color: palette.textMuted,
    marginTop: 6,
  },
  timestampUser: {
    marginRight: 4,
  },
  timestampAssistant: {
    marginLeft: 4,
  },

  // Thinking indicator
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  thinkingText: {
    marginLeft: 8,
    fontSize: 12,
    color: palette.textSub,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.bg,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: palette.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.text,
    fontSize: 14,
    lineHeight: 20,
  },
  sendBtn: {
    marginLeft: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnPressed: {
    opacity: 0.85,
  },
  sendBtnDisabled: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  sendBtnLabel: {
    color: palette.accentText,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  sendBtnLabelDisabled: {
    color: palette.textMuted,
  },
});

export default styles;
