import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../ThemeContext';
import type { PetAvatar } from '../types';
import { MuseDog } from './MuseDog';

type Props = { avatar?: PetAvatar; style?: StyleProp<ViewStyle> };

/** A saved custom portrait is static; Kai remains the waving brand companion. */
export function PetMuseAvatar({ avatar, style }: Props) {
  const { colors } = useTheme();
  const [failedUri, setFailedUri] = useState<string>();
  const uri = avatar?.uri;
  if (!uri || uri === failedUri) return <MuseDog style={[styles.size, style]} />;

  return <View style={[styles.size, style]}>
    <View style={[styles.frame, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Image key={avatar.createdAt} source={{ uri }} style={styles.image}
        accessible accessibilityLabel="Your pet’s custom Muse avatar"
        contentFit="contain" contentPosition="center" autoplay={false}
        transition={0} recyclingKey={avatar.createdAt} cachePolicy="memory"
        onError={() => setFailedUri(uri)} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  size: { width: 180, height: 180 },
  frame: { flex: 1, margin: 12, borderWidth: 1, borderRadius: 24, padding: 8, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});
