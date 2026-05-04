import { ColorSchemeName } from 'react-native';

export type ChatPalette = {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  divider: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  bubbleUserBg: string;
  bubbleUserText: string;
  bubbleAiBg: string;
  bubbleAiText: string;
  online: string;
  shadow: string;
};

const light: ChatPalette = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F7F7F8',
  border: '#ECECEE',
  divider: '#F0F0F2',
  textPrimary: '#111114',
  textSecondary: '#4B4B52',
  textMuted: '#8A8A93',
  accent: '#111114',
  accentSoft: '#F2F2F4',
  bubbleUserBg: '#111114',
  bubbleUserText: '#FFFFFF',
  bubbleAiBg: '#F4F4F6',
  bubbleAiText: '#111114',
  online: '#22C55E',
  shadow: 'rgba(17,17,20,0.06)',
};

const dark: ChatPalette = {
  background: '#0E0E10',
  surface: '#141418',
  surfaceMuted: '#1A1A1F',
  border: '#26262C',
  divider: '#22222A',
  textPrimary: '#F4F4F5',
  textSecondary: '#C7C7CC',
  textMuted: '#8A8A93',
  accent: '#F4F4F5',
  accentSoft: '#1F1F25',
  bubbleUserBg: '#F4F4F5',
  bubbleUserText: '#111114',
  bubbleAiBg: '#1E1E24',
  bubbleAiText: '#F4F4F5',
  online: '#22C55E',
  shadow: 'rgba(0,0,0,0.4)',
};

export const getChatPalette = (scheme: ColorSchemeName): ChatPalette =>
  scheme === 'dark' ? dark : light;
