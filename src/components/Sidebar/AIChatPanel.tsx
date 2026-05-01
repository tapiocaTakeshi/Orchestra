import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { styles, COLORS } from './aiChatStyles';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}

export interface AIChatPanelProps {
  visible?: boolean;
  title?: string;
  online?: boolean;
  messages?: ChatMessage[];
  loading?: boolean;
  onSend?: (text: string) => void;
  onClose?: () => void;
  onClear?: () => void;
}

const SUGGESTIONS = [
  '今日のタスクを要約して',
  'このページの使い方を教えて',
  '英語に翻訳して',
  'アイデア出しを手伝って',
];

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${hh}:${mm}`;
};

const TypingDots: React.FC = () => {
  const a1 = useRef(new Animated.Value(0.3)).current;
  const a2 = useRef(new Animated.Value(0.3)).current;
  const a3 = useRef(new Animated.Value(0.3)).current;

  React.useEffect(() => {
    const loop = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ]),
      ).start();
    loop(a1, 0);
    loop(a2, 150);
    loop(a3, 300);
  }, [a1, a2, a3]);

  return (
    <View style={styles.typingRow}>
      <Animated.View style={[styles.typingDot, { opacity: a1 }]} />
      <Animated.View style={[styles.typingDot, { opacity: a2 }]} />
      <Animated.View style={[styles.typingDot, { opacity: a3 }]} />
    </View>
  );
};

const MessageBubble: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
  const isUser = msg.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>AI</Text>
        </View>
      )}
      <View style={{ maxWidth: '78%' }}>
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
            {msg.content}
          </Text>
        </View>
        <Text style={[styles.timeText, isUser ? styles.timeRight : styles.timeLeft]}>
          {formatTime(msg.createdAt)}
        </Text>
      </View>
    </View>
  );
};

export const AIChatPanel: React.FC<AIChatPanelProps> = ({
  visible = true,
  title = 'AI Assistant',
  online = true,
  messages = [],
  loading = false,
  onSend,
  onClose,
  onClear,
}) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const grouped = useMemo(() => {
    // 今日 / それ以前 を簡易グルーピング
    const today: ChatMessage[] = [];
    const earlier: ChatMessage[] = [];
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    messages.forEach((m) => {
      if (m.createdAt >= startOfToday.getTime()) today.push(m);
      else earlier.push(m);
    });
    return { today, earlier };
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSend?.(text);
    setInput('');
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  if (!visible) return null;

  const isEmpty = messages.length === 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.brandDot} />
          <View>
            <Text style={styles.headerTitle}>{title}</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: online ? COLORS.success : COLORS.muted }]} />
              <Text style={styles.statusText}>{online ? 'オンライン' : 'オフライン'}</Text>
            </View>
          </View>
        </View>
        <View style={styles.headerActions}>
          {onClear && (
            <TouchableOpacity style={styles.iconBtn} onPress={onClear} accessibilityLabel="履歴をクリア">
              <Text style={styles.iconBtnText}>⟲</Text>
            </TouchableOpacity>
          )}
          {onClose && (
            <TouchableOpacity style={styles.iconBtn} onPress={onClose} accessibilityLabel="閉じる">
              <Text style={styles.iconBtnText}>×</Text>
            </TouchableOpacity>
          )}
        </View>
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
          <View style={styles.emptyWrap}>
            <View style={styles.emptyAvatar}>
              <Text style={styles.emptyAvatarText}>AI</Text>
            </View>
            <Text style={styles.emptyTitle}>何でも聞いてください</Text>
            <Text style={styles.emptySubtitle}>
              質問・要約・翻訳・アイデア出しまで、{'\n'}あなたの作業をサポートします。
            </Text>

            <Text style={styles.sectionLabel}>提案</Text>
            <View style={styles.chipWrap}>
              {SUGGESTIONS.map((s) => (
                <TouchableOpacity key={s} style={styles.chip} onPress={() => onSend?.(s)}>
                  <Text style={styles.chipText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <>
            {grouped.earlier.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>これまでの会話</Text>
                {grouped.earlier.map((m) => (
                  <MessageBubble key={m.id} msg={m} />
                ))}
              </>
            )}
            {grouped.today.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>今日</Text>
                {grouped.today.map((m) => (
                  <MessageBubble key={m.id} msg={m} />
                ))}
              </>
            )}
            {loading && (
              <View style={[styles.bubbleRow, styles.bubbleRowLeft]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>AI</Text>
                </View>
                <View style={[styles.bubble, styles.bubbleAssistant]}>
                  <TypingDots />
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Composer */}
      <View style={styles.composerWrap}>
        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="メッセージを入力..."
            placeholderTextColor={COLORS.muted}
            style={styles.input}
            multiline
            maxLength={2000}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || loading}
            accessibilityLabel="送信"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendBtnText}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.footerHint}>Enter で送信 ・ Shift+Enter で改行</Text>
      </View>
    </KeyboardAvoidingView>
  );
};

export default AIChatPanel;
