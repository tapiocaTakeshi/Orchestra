import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { styles, tokens } from './aiChatStyles';

export type ChatMessage = {
  id: string;
  role: 'user' | 'ai';
  text: string;
  createdAt: number;
};

export type AIChatSidebarProps = {
  title?: string;
  subtitle?: string;
  initialMessages?: ChatMessage[];
  suggestions?: string[];
  onSend?: (text: string) => Promise<string> | string;
  onClose?: () => void;
};

const defaultSuggestions = [
  '今日のタスクを要約',
  'コードをレビュー',
  '文章を整える',
];

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const TypingDots: React.FC = () => {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const c = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const make = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, {
            toValue: 1,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
    const anims = [make(a, 0), make(b, 150), make(c, 300)];
    anims.forEach((x) => x.start());
    return () => anims.forEach((x) => x.stop());
  }, [a, b, c]);

  const dotStyle = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
    transform: [
      {
        translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }),
      },
    ],
  });

  return (
    <View style={styles.typingRow}>
      <Animated.View style={[styles.typingDot, dotStyle(a)]} />
      <Animated.View style={[styles.typingDot, dotStyle(b)]} />
      <Animated.View style={[styles.typingDot, dotStyle(c)]} />
    </View>
  );
};

export const AIChatSidebar: React.FC<AIChatSidebarProps> = ({
  title = 'AI Assistant',
  subtitle = 'Online',
  initialMessages,
  suggestions = defaultSuggestions,
  onSend,
  onClose,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages ?? [
      {
        id: 'welcome',
        role: 'ai',
        text: 'こんにちは。今日はどんなお手伝いをしましょうか？',
        createdAt: Date.now(),
      },
    ]
  );
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const canSend = input.trim().length > 0 && !busy;

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  };

  useEffect(() => {
    scrollToEnd();
  }, [messages.length, busy]);

  const handleSend = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setBusy(true);

    try {
      const reply = onSend
        ? await onSend(text)
        : `「${text}」について考えてみますね。`;
      const aiMsg: ChatMessage = {
        id: `a_${Date.now()}`,
        role: 'ai',
        text: typeof reply === 'string' ? reply : String(reply ?? ''),
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'ai',
          text: '送信時にエラーが発生しました。もう一度お試しください。',
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const initials = useMemo(() => {
    const t = title.trim();
    if (!t) return 'AI';
    const parts = t.split(/\s+/);
    return (parts[0]?.[0] ?? 'A') + (parts[1]?.[0] ?? 'I');
  }, [title]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials.toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>{title}</Text>
            <View style={styles.headerSubRow}>
              <View style={styles.statusDot} />
              <Text style={styles.headerSub}>{subtitle}</Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row' }}>
          <Pressable
            style={({ pressed }) => [
              styles.iconBtn,
              pressed && { backgroundColor: tokens.bgSubtle },
            ]}
            onPress={() =>
              setMessages([
                {
                  id: `welcome_${Date.now()}`,
                  role: 'ai',
                  text: '新しい会話を始めましょう。',
                  createdAt: Date.now(),
                },
              ])
            }
            accessibilityLabel="新しい会話"
          >
            <Text style={styles.iconBtnText}>＋</Text>
          </Pressable>
          {onClose && (
            <Pressable
              style={({ pressed }) => [
                styles.iconBtn,
                pressed && { backgroundColor: tokens.bgSubtle },
              ]}
              onPress={onClose}
              accessibilityLabel="閉じる"
            >
              <Text style={styles.iconBtnText}>×</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollToEnd}
      >
        <View style={styles.dateRow}>
          <Text style={styles.dateText}>Today</Text>
        </View>

        {messages.map((m) => {
          const isUser = m.role === 'user';
          return (
            <View
              key={m.id}
              style={[
                styles.msgRow,
                isUser ? styles.msgRowUser : styles.msgRowAi,
              ]}
            >
              <View
                style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}
              >
                <Text style={styles.bubbleText}>{m.text}</Text>
                <Text
                  style={[
                    styles.bubbleMeta,
                    isUser && styles.bubbleMetaUser,
                  ]}
                >
                  {formatTime(m.createdAt)}
                </Text>
              </View>
            </View>
          );
        })}

        {busy && (
          <View style={[styles.msgRow, styles.msgRowAi]}>
            <TypingDots />
          </View>
        )}
      </ScrollView>

      {/* Suggestions (1件目のメッセージのみ表示) */}
      {messages.length <= 1 && suggestions.length > 0 && (
        <View style={styles.suggestionsWrap}>
          <Text style={styles.suggestionsLabel}>Suggested</Text>
          <View style={styles.suggestionsRow}>
            {suggestions.map((s) => (
              <Pressable
                key={s}
                style={({ pressed }) => [
                  styles.chip,
                  pressed && { backgroundColor: tokens.bgSubtle },
                ]}
                onPress={() => handleSend(s)}
              >
                <Text style={styles.chipText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Composer */}
      <View style={styles.composer}>
        <View style={styles.composerRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="メッセージを入力..."
            placeholderTextColor={tokens.textSubtle}
            multiline
            onSubmitEditing={() => handleSend()}
            blurOnSubmit={false}
            editable={!busy}
          />
          <Pressable
            onPress={() => handleSend()}
            disabled={!canSend}
            style={({ pressed }) => [
              styles.sendBtn,
              !canSend && styles.sendBtnDisabled,
              pressed && canSend && { opacity: 0.85 },
            ]}
            accessibilityLabel="送信"
          >
            <Text style={styles.sendIcon}>↑</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>Enter で送信 ・ Shift+Enter で改行</Text>
      </View>
    </KeyboardAvoidingView>
  );
};

export default AIChatSidebar;
