import { StyleSheet } from 'react-native';

export const COLORS = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F6F6F7',
  border: '#ECECEE',
  borderStrong: '#E2E2E5',
  text: '#111113',
  textSub: '#5A5A60',
  muted: '#9A9AA2',
  primary: '#111113',
  primaryDisabled: '#C9C9CE',
  online: '#22C55E',
};

const RADIUS = {
  bubble: 14,
  bubbleSharp: 4,
  pill: 999,
  input: 12,
};

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: COLORS.background,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTexts: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: 0.1,
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  headerStatus: {
    fontSize: 11.5,
    color: COLORS.textSub,
    letterSpacing: 0.2,
  },
  headerAction: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionText: {
    fontSize: 18,
    color: COLORS.muted,
    marginTop: -4,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 0,
  },

  /* Messages */
  messages: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
    maxWidth: '100%',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },

  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.bubble,
    marginHorizontal: 8,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: RADIUS.bubbleSharp,
  },
  bubbleUser: {
    backgroundColor: COLORS.surfaceAlt,
    borderBottomRightRadius: RADIUS.bubbleSharp,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextAssistant: {
    color: COLORS.text,
  },
  bubbleTextUser: {
    color: COLORS.text,
  },

  /* Avatar */
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarAssistant: {
    backgroundColor: COLORS.primary,
  },
  avatarUser: {
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  avatarText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  avatarTextAssistant: {
    color: COLORS.surface,
  },
  avatarTextUser: {
    color: COLORS.text,
  },

  /* Typing */
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.muted,
    marginHorizontal: 2,
  },

  /* Input */
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.select ? 14 : 14,
    backgroundColor: COLORS.background,
  },
  inputWrap: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADIUS.input,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
  },
  input: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.text,
    padding: 0,
    margin: 0,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.primaryDisabled,
  },
  sendButtonIcon: {
    color: COLORS.surface,
    fontSize: 18,
    fontWeight: '700',
    marginTop: -2,
  },
});

import { Platform } from 'react-native';
