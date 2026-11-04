import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../ThemeContext';

export function BrandHeader() {
  const { mode, setPreference } = useTheme();
  const nextMode = mode === 'night' ? 'day' : 'night';
  return <View style={styles.band}>
    <View accessible accessibilityRole="image" accessibilityLabel="Meta Pet" style={styles.brand}>
      <View style={styles.markWindow}>
        <Image source={require('../../assets/meta-pet-logo.png')} resizeMode="contain" accessible={false} style={styles.markImage} />
      </View>
      <Text accessible={false} allowFontScaling={false} numberOfLines={1} style={styles.wordmark}>Meta Pet</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Switch to ${nextMode} mode`}
      accessibilityHint={`Current appearance is ${mode} mode`} onPress={() => setPreference(nextMode)}
      style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.7 }]}>
      <Ionicons name={mode === 'night' ? 'sunny-outline' : 'moon-outline'} size={21} color="#FFFFFF" />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  band: { height: 64, width: '100%', flexShrink: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1C2B33' },
  brand: { height: 54, maxWidth: '65%', flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Clip the blue mark from the existing 650 × 160 asset, before its old lettering.
  markWindow: { width: 60, height: 54, overflow: 'hidden', flexShrink: 0 },
  markImage: { position: 'absolute', left: 0, top: 0, width: (650 / 160) * 54, height: 54 },
  wordmark: { color: '#FFFFFF', fontSize: 34, lineHeight: 42, fontWeight: '500', letterSpacing: -1, flexShrink: 1 },
  toggle: { position: 'absolute', right: 12, top: 10, width: 44, height: 44, borderRadius: 16, borderWidth: 1, borderColor: '#FFFFFF40', backgroundColor: '#FFFFFF0D', alignItems: 'center', justifyContent: 'center' },
});

