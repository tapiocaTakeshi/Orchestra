### 1. 実装プラン

直前コンテキストに具体的な既存ファイル本体スナップショットが見当たらないため、React Native プロジェクトでよくあるパス（`src/components/Sidebar/AIChatPanel.tsx` など）に **ミニマル＆わかりやすい** AI チャットサイドバーを実装します。既存に同名ファイルがあれば上書きせず差分を取りたいところですが、コンテキスト上に該当する SEARCH 対象が無いため、新規ファイルとして以下を提供します（既存ファイルがある場合は import 先のパスのみ合わせれば差し替え可能）。

ミニマル設計のポイント:
- 余白（padding 16 / 20）と細い区切り線（hairline）で情報を整理
- アクセントは 1 色（#111 / #6C5CE7 系）に絞り、彩度を抑える
- メッセージバブルは角丸 16・影なし・薄いグレー背景でモダンに
- ヘッダーは「AI Assistant」「オンライン状態のドット」「閉じるボタン」だけのシンプル構成
- 入力欄は丸型・送信ボタンは円形 FAB 風で押しやすく
- セクションラベル（"今日の会話" など）でグルーピングしわかりやすく
- KeyboardAvoidingView 対応、空状態（提案チップ）を表示

### 2. ファイル一覧

| ファイル | 操作 | 概要 |
|---|---|---|
| src/components/Sidebar/AIChatPanel.tsx | 新規 | ミニマルな AI チャットサイドバー本体 |
| src/components/Sidebar/aiChatStyles.ts | 新規 | スタイル定義（テーマ分離） |

### 3. コード本体

```tsx:src/components/Sidebar/AIChatPanel.tsx
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
```

```ts:src/components/Sidebar/aiChatStyles.ts
import { StyleSheet, Platform } from 'react-native';

export const COLORS = {
  bg: '#FFFFFF',
  surface: '#FAFAFA',
  border: '#ECECEC',
  text: '#111111',
  subtext: '#6B7280',
  muted: '#9CA3AF',
  accent: '#111111',
  accentSoft: '#F3F4F6',
  success: '#10B981',
  bubbleAssistant: '#F4F4F5',
  bubbleUser: '#111111',
  shadow: 'rgba(17,17,17,0.06)',
};

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: 340,
    maxWidth: '100%',
    backgroundColor: COLORS.bg,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: COLORS.border,
    ...Platform.select({
      web: { boxShadow: '0 0 24px rgba(17,17,17,0.04)' },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 12,
        shadowOffset: { width: -2, height: 0 },
        elevation: 2,
      },
    }),
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginTop: 3,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    color: COLORS.subtext,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: {
    fontSize: 18,
    color: COLORS.subtext,
    lineHeight: 20,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginHorizontal: 16,
  },

  /* Body */
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 8,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 4,
  },

  /* Empty state */
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 28,
    paddingHorizontal: 12,
  },
  emptyAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyAvatarText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.subtext,
    textAlign: 'center',
    marginBottom: 8,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.accentSoft,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '500',
  },

  /* Avatars */
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  /* Bubbles */
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  bubbleRowLeft: {
    justifyContent: 'flex-start',
  },
  bubbleRowRight: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.bubbleAssistant,
    borderTopLeftRadius: 6,
  },
  bubbleUser: {
    backgroundColor: COLORS.bubbleUser,
    borderTopRightRadius: 6,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextAssistant: {
    color: COLORS.text,
  },
  bubbleTextUser: {
    color: '#fff',
  },
  timeText: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 4,
  },
  timeLeft: {
    textAlign: 'left',
    marginLeft: 4,
  },
  timeRight: {
    textAlign: 'right',
    marginRight: 4,
  },

  /* Typing */
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 16,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.muted,
  },

  /* Composer */
  composerWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 18 : 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    maxHeight: 120,
    minHeight: 24,
    paddingTop: 4,
    paddingBottom: 4,
    ...Platform.select({
      web: { outlineStyle: 'none' as any },
      default: {},
    }),
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.muted,
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  footerHint: {
    fontSize: 10,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 8,
  },
});
```

既存のサイドバーコンポーネントから AI チャット部分を差し替えるための一般的なパターンも置いておきます。プロジェクト内の現行 import 箇所（例: `Sidebar.tsx`）に下記のような差分を当ててください。

```tsx:src/components/Sidebar/Sidebar.tsx
<<<SEARCH
import AIChat from './AIChat';
===
import AIChatPanel from './AIChatPanel';
>>>REPLACE
```

```tsx:src/components/Sidebar/Sidebar.tsx
<<<SEARCH
        <AIChat />
===
        <AIChatPanel
          messages={aiMessages}
          loading={aiLoading}
          online
          onSend={handleAISend}
          onClear={handleAIClear}
        />
>>>REPLACE
```

### 4. 検証方針

- `npx tsc --noEmit` で型エラーが無いか確認
- iOS / Android / Web (RN Web) でレンダリング確認
  - 空状態 → 提案チップタップで `onSend` 発火
  - メッセージ送信 → 自動スクロール末尾追従
  - `loading=true` でタイピングインジケーター表示
  - 閉じる / クリアアイコンが動作
- Minimal デザイン観点: アクセント色は黒系 1 色のみ、影は極弱、ボーダーは hairline
- アクセシビリティ: `accessibilityLabel` を主要ボタンに付与済み
- 既存 `AIChat` コンポーネントが存在する場合は、上の SEARCH/REPLACE で import を差し替えてください（パスや prop 名が異なる場合は SEARCH 文字列を実コードに合わせて調整）