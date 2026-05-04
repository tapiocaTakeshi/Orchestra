### 1. 実装プラン
- 対象: サイドバー内の「AIチャット」セクションのデザイン改善（React Native / Minimal テーマ）
- 方針:
  - 既存の `AIChatSidebar` コンポーネントをミニマル基調（白背景・余白多め・細いボーダー・モノクロ＋1アクセント）に刷新
  - わかりやすさ向上のため以下を追加:
    - ヘッダーに AI アバター・ステータスドット・タイトル＋サブタイトル（「いつでも質問できます」）
    - 空状態（Empty State）に「💡 こんなことが聞けます」というサジェスト・チップ
    - メッセージバブルを user / assistant で明確に色分け＆配置を左右で分離
    - 「考え中…」のタイピングインジケータ（3点アニメーション）
    - 入力欄を角丸・影なし・フォーカスで枠色変化、送信ボタンは円形アイコン化
    - キーボード回避・自動スクロール・空入力ガード
  - スタイル定数 `colors / spacing / radius` を上部に集約し、変更しやすく
- 影響範囲: `src/components/AIChatSidebar.tsx`（既存の同名ファイルがある想定で全文置換／無ければ新規作成）

### 2. ファイル一覧
| ファイル | 操作 | 概要 |
|---|---|---|
| src/components/AIChatSidebar.tsx | 新規/全文更新 | ミニマル基調に刷新したサイドバー AI チャット UI |
| src/components/ai-chat/SuggestionChip.tsx | 新規 | サジェスト用の小さなチップ（再利用可能） |
| src/components/ai-chat/TypingDots.tsx | 新規 | 「考え中…」3点ドットアニメーション |

### 3. コード本体

```tsx:src/components/AIChatSidebar.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SuggestionChip } from './ai-chat/SuggestionChip';
import { TypingDots } from './ai-chat/TypingDots';

/**
 * Minimal な AI チャットサイドバー
 * - 余白を広めに、罫線は 1px、色はモノクロ + 1 アクセント（インディゴ）
 * - メッセージは user / assistant で左右に分離
 * - 空状態にサジェストチップを表示してわかりやすく
 */

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: number;
}

export interface AIChatSidebarProps {
  messages?: ChatMessage[];
  onSend?: (text: string) => void | Promise<void>;
  isLoading?: boolean;
  title?: string;
  subtitle?: string;
  suggestions?: string[];
  onClose?: () => void;
}

const colors = {
  bg: '#FFFFFF',
  surface: '#FAFAFA',
  border: '#ECECEC',
  borderStrong: '#D9D9D9',
  text: '#1A1A1A',
  textMuted: '#8A8A8A',
  textSubtle: '#B5B5B5',
  accent: '#4F46E5',
  accentSoft: '#EEF0FF',
  bubbleUser: '#1A1A1A',
  bubbleUserText: '#FFFFFF',
  bubbleAssistant: '#F4F4F5',
  bubbleAssistantText: '#1A1A1A',
  online: '#22C55E',
};

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

const DEFAULT_SUGGESTIONS = [
  '今日のタスクを整理して',
  'このコードをレビューして',
  '要点を3行でまとめて',
  'アイデアを5つ出して',
];

export const AIChatSidebar: React.FC<AIChatSidebarProps> = ({
  messages = [],
  onSend,
  isLoading = false,
  title = 'AI アシスタント',
  subtitle = 'いつでも質問できます',
  suggestions = DEFAULT_SUGGESTIONS,
  onClose,
}) => {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const canSend = input.trim().length > 0 && !isLoading;

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    if (onSend) await onSend(text);
  }, [input, isLoading, onSend]);

  const handleSuggestion = useCallback(
    async (text: string) => {
      if (isLoading) return;
      if (onSend) await onSend(text);
    },
    [isLoading, onSend],
  );

  useEffect(() => {
    // メッセージ更新時に自動スクロール
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [messages.length, isLoading]);

  const isEmpty = useMemo(
    () => messages.filter((m) => m.role !== 'system').length === 0,
    [messages],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>AI</Text>
            <View style={styles.statusDot} />
          </View>
          <View style={{ marginLeft: spacing.md, flexShrink: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>
        {onClose && (
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [
              styles.iconBtn,
              pressed && { opacity: 0.6 },
            ]}
            accessibilityLabel="閉じる"
          >
            <Text style={styles.iconBtnText}>×</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.divider} />

      {/* Body */}
      <ScrollView
        ref={scrollRef}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {isEmpty ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>こんにちは 👋</Text>
            <Text style={styles.emptyDesc}>
              何でも気軽に聞いてください。下のサジェストから始めることもできます。
            </Text>
            <Text style={styles.emptyLabel}>💡 こんなことが聞けます</Text>
            <View style={styles.chipWrap}>
              {suggestions.map((s) => (
                <SuggestionChip
                  key={s}
                  label={s}
                  onPress={() => handleSuggestion(s)}
                />
              ))}
            </View>
          </View>
        ) : (
          messages
            .filter((m) => m.role !== 'system')
            .map((m) => <MessageBubble key={m.id} message={m} />)
        )}

        {isLoading && (
          <View style={styles.row}>
            <View style={[styles.bubble, styles.bubbleAssistant]}>
              <TypingDots />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Composer */}
      <View style={styles.composerWrap}>
        <View
          style={[
            styles.composer,
            isFocused && { borderColor: colors.accent },
          ]}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="メッセージを入力…"
            placeholderTextColor={colors.textSubtle}
            style={styles.input}
            multiline
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            returnKeyType="send"
          />
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            style={({ pressed }) => [
              styles.sendBtn,
              !canSend && styles.sendBtnDisabled,
              pressed && canSend && { opacity: 0.85 },
            ]}
            accessibilityLabel="送信"
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.sendBtnText}>↑</Text>
            )}
          </Pressable>
        </View>
        <Text style={styles.hint}>Enter で送信 ・ Shift + Enter で改行</Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.row, isUser ? styles.rowEnd : styles.rowStart]}>
      {!isUser && (
        <View style={styles.smallAvatar}>
          <Text style={styles.smallAvatarText}>AI</Text>
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            isUser ? styles.bubbleUserText : styles.bubbleAssistantText,
          ]}
        >
          {message.content}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  statusDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.online,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  iconBtnText: {
    fontSize: 22,
    color: colors.textMuted,
    lineHeight: 24,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  empty: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyDesc: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textMuted,
    marginBottom: spacing.xl,
  },
  emptyLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  rowStart: { justifyContent: 'flex-start' },
  rowEnd: { justifyContent: 'flex-end' },
  smallAvatar: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallAvatarText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '700',
  },
  bubble: {
    maxWidth: '82%',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
  },
  bubbleUser: {
    backgroundColor: colors.bubbleUser,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: colors.bubbleAssistant,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleUserText: { color: colors.bubbleUserText },
  bubbleAssistantText: { color: colors.bubbleAssistantText },
  composerWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    maxHeight: 120,
    paddingVertical: Platform.OS === 'ios' ? 6 : 2,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: colors.borderStrong,
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  hint: {
    marginTop: spacing.xs + 2,
    fontSize: 11,
    color: colors.textSubtle,
    textAlign: 'right',
  },
});

export default AIChatSidebar;
```

```tsx:src/components/ai-chat/SuggestionChip.tsx
import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';

interface Props {
  label: string;
  onPress?: () => void;
}

export const SuggestionChip: React.FC<Props> = ({ label, onPress }) => {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        pressed && styles.chipPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.chipText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
  },
  chipPressed: {
    backgroundColor: '#F4F4F5',
    borderColor: '#D9D9D9',
  },
  chipText: {
    fontSize: 12,
    color: '#1A1A1A',
  },
});

export default SuggestionChip;
```

```tsx:src/components/ai-chat/TypingDots.tsx
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

/**
 * 3 つのドットがふわっと上下する「考え中…」インジケータ。
 */
export const TypingDots: React.FC<{ color?: string }> = ({ color = '#8A8A8A' }) => {
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  const a3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const make = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 350,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 350,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
    const anims = [make(a1, 0), make(a2, 120), make(a3, 240)];
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [a1, a2, a3]);

  const translate = (v: Animated.Value) =>
    v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  const opacity = (v: Animated.Value) =>
    v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });

  return (
    <View style={styles.row} accessibilityLabel="AI が入力中">
      {[a1, a2, a3].map((v, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: color,
              opacity: opacity(v),
              transform: [{ translateY: translate(v) }],
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
});

export default TypingDots;
```

### 4. 検証方針
- 表示確認:
  1. アプリ起動 → サイドバーを開き、AI チャットの空状態でサジェストチップが 4 つ並ぶこと
  2. チップをタップ → `onSend` が発火し、ユーザーバブル（黒背景・右寄せ）が表示されること
  3. `isLoading=true` のとき左側に 3 点ドットが上下にアニメーションすること
  4. メッセージが増えると自動で末尾までスクロールすること
  5. 入力欄フォーカス時に枠がインディゴに変化、空のとき送信ボタンがグレーで無効化されること
- 型チェック: `tsc --noEmit`（or `npx tsc -p tsconfig.json`）でエラーが出ないこと
- iOS / Android 両方で `KeyboardAvoidingView` がキーボードを正しく回避するか確認
- レビュア注目点:
  - 色は `colors` オブジェクトに集約済み。テーマ切替（ダーク等）時はここを差し替えるだけで対応可能
  - `MessageBubble` は純粋関数コンポーネントとして切り出し済みで再レンダリングが軽い
  - `gap` を使用しているため React Native 0.71 以上で動作（古いバージョンの場合は `marginBottom` 等に置換が必要）

```bash
npx tsc --noEmit
```