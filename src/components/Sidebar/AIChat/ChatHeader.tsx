import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { chatTheme } from './theme';

interface Props {
  title?: string;
  online?: boolean;
  onNewChat?: () => void;
}

export const ChatHeader: React.FC<Props> = ({
  title = 'AI アシスタント',
  online = true,
  onNewChat,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>AI</Text>
          {online && <View style={styles.statusDot} />}
        </View>
        <View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            {online ? 'オンライン' : 'オフライン'}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="新しいチャットを開始"
        onPress={onNewChat}
        style={({ pressed }) => [
          styles.newBtn,
          pressed && { opacity: 0.6 },
        ]}
        hitSlop={8}
      >
        <Text style={styles.newBtnIcon}>＋</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: chatTheme.spacing.lg,
    paddingVertical: chatTheme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: chatTheme.colors.border,
    backgroundColor: chatTheme.colors.background,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: chatTheme.spacing.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: chatTheme.radius.pill,
    backgroundColor: chatTheme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: chatTheme.colors.accent,
    fontWeight: '600',
    fontSize: chatTheme.font.small,
  },
  statusDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 10,
    height: 10,
    borderRadius: chatTheme.radius.pill,
    backgroundColor: chatTheme.colors.online,
    borderWidth: 2,
    borderColor: chatTheme.colors.background,
  },
  title: {
    fontSize: chatTheme.font.title,
    fontWeight: '600',
    color: chatTheme.colors.textPrimary,
  },
  subtitle: {
    fontSize: chatTheme.font.tiny,
    color: chatTheme.colors.textSecondary,
    marginTop: 2,
  },
  newBtn: {
    width: 32,
    height: 32,
    borderRadius: chatTheme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: chatTheme.colors.surface,
    borderWidth: 1,
    borderColor: chatTheme.colors.border,
  },
  newBtnIcon: {
    fontSize: 18,
    lineHeight: 20,
    color: chatTheme.colors.textPrimary,
  },
});

export default ChatHeader;
