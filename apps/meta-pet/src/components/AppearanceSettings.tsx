import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import type { ThemePreference } from '../theme';

const choices: { value: ThemePreference; label: string; icon: 'sunny-outline' | 'moon-outline' | 'phone-portrait-outline' }[] = [
  { value: 'day', label: 'Day', icon: 'sunny-outline' },
  { value: 'night', label: 'Night', icon: 'moon-outline' },
  { value: 'system', label: 'Device', icon: 'phone-portrait-outline' },
];

export function AppearanceSettings() {
  const { colors, preference, mode, setPreference } = useTheme();
  return <View style={styles.section}>
    <Text style={[styles.title, { color: colors.navy }]}>Day or night, your way.</Text>
    <Text style={[styles.body, { color: colors.slate }]}>Choose a palette or follow your device. Your choice is saved on this device.</Text>
    <View accessibilityRole="radiogroup" accessibilityLabel="Colour mode" style={styles.choices}>
      {choices.map(choice => <Pressable key={choice.value} accessibilityRole="radio"
        accessibilityLabel={choice.label} accessibilityState={{ checked: preference === choice.value }} aria-checked={preference === choice.value}
        onPress={() => setPreference(choice.value)}
        style={({ pressed }) => [styles.choice, { backgroundColor: preference === choice.value ? colors.blueWash : colors.surface,
          borderColor: preference === choice.value ? colors.blue : colors.line }, pressed && { opacity: 0.7 }]}>
        <Ionicons name={choice.icon} size={20} color={preference === choice.value ? colors.blue : colors.slate} />
        <Text style={[styles.label, { color: preference === choice.value ? colors.blue : colors.slate }]}>{choice.label}</Text>
      </Pressable>)}
    </View>
    <Text style={[styles.caption, { color: colors.slate }]}>{preference === 'system' ? `Following your device · ${mode} mode` : `${mode === 'night' ? 'Night' : 'Day'} mode selected`}</Text>
    <View style={[styles.divider, { backgroundColor: colors.line }]} />
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 12 }, title: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.5 },
  body: { fontSize: 13, lineHeight: 21 }, choices: { flexDirection: 'row', gap: 10 },
  choice: { flex: 1, minHeight: 58, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  label: { fontSize: 13, fontWeight: '700' }, caption: { fontSize: 12, lineHeight: 18 }, divider: { height: 1, marginVertical: 8 },
});
