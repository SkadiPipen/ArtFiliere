import { COLORS } from '@/constants/colors';
import { MessageSquare } from 'lucide-react-native';
import { createElement } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import UnreadMessageBadge from './UnreadMessageBadge';

const animation = `
  [id^="artfilier-message-button-"]:is(:hover, :focus-visible) { background-color: ${COLORS.redDark}; }
  [id^="artfilier-message-extra-"] { position: absolute; inset: 0; opacity: 0; transform: scale(.65); }
  [id^="artfilier-message-button-"]:is(:hover, :focus-visible) [id^="artfilier-message-glyph-"] { transform: translate(-6px, 4px) scale(.67); }
  [id^="artfilier-message-button-"]:is(:hover, :focus-visible) [id^="artfilier-message-extra-"] { opacity: 1; transform: translate(6px, -5px) scale(.67); }
  @media (prefers-reduced-motion: no-preference) {
    [id^="artfilier-message-glyph-"] { transition: transform 180ms ease-out; }
    [id^="artfilier-message-extra-"] { transition: transform 180ms ease-out, opacity 150ms ease-out; }
  }
`;

export default function MessageLauncher({ id, uid, size, right, bottom, onPress }: {
  id: 'marketplace' | 'workspace';
  uid?: string;
  size: number;
  right: number;
  bottom: number;
  onPress: () => void;
}) {
  const web = Platform.OS === 'web';
  return <>
    {web && createElement('style', null, animation)}
    <TouchableOpacity
      id={`artfilier-message-button-${id}`}
      accessibilityRole="button"
      accessibilityLabel="Open messages"
      style={[styles.button, { width: size, height: size, borderRadius: size / 2, right, bottom }]}
      onPress={onPress}
    >
      <View style={styles.icon} aria-hidden>
        {web && <View id={`artfilier-message-extra-${id}`}><MessageSquare color={COLORS.white} size={26} fill={COLORS.white} /></View>}
        <View id={`artfilier-message-glyph-${id}`}><MessageSquare color={COLORS.white} size={26} fill={COLORS.white} /></View>
      </View>
      <UnreadMessageBadge uid={uid} />
    </TouchableOpacity>
  </>;
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute', backgroundColor: COLORS.red, justifyContent: 'center', alignItems: 'center',
    elevation: 5, zIndex: 10, shadowColor: COLORS.textDark, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4,
  },
  icon: { position: 'relative' },
});
