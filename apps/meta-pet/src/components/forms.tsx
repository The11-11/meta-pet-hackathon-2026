import { useMemo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ThemeColors } from '../theme';
import { useTheme } from '../ThemeContext';
import { BrandHeader } from './BrandHeader';

export function FormPage({ children }: { children: ReactNode }) { const { styles } = useStyles(); return <View style={styles.root}><BrandHeader /><ScrollView style={styles.root} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">{children}</ScrollView></View>; }
export function Field({ label, value, onChange, placeholder, multiline = false, secure = false, maxLength = 600 }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean; secure?: boolean; maxLength?: number }) {
  const { colors, styles } = useStyles();
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.slate} multiline={multiline} maxLength={maxLength} secureTextEntry={secure} autoCapitalize="none" autoCorrect={false} style={[styles.input, multiline && styles.multiline]} /></View>;
}
export function FormTitle({ title, body }: { title: string; body?: string }) { const { styles } = useStyles(); return <View style={{ gap: 10, marginBottom: 10 }}><Text style={styles.title}>{title}</Text>{body && <Text style={styles.body}>{body}</Text>}</View>; }
export function FormNote({ children, error = false }: { children: ReactNode; error?: boolean }) { const { colors, styles } = useStyles(); return <View accessibilityRole={error ? 'alert' : undefined} style={[styles.note, error && { backgroundColor: colors.errorWash }]}><Text style={[styles.noteText, error && { color: colors.danger }]}>{children}</Text></View>; }

function useStyles() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return { colors, styles };
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({ root: { flex: 1, backgroundColor: colors.cloud }, page: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: 24, gap: 20, paddingBottom: 50 }, field: { gap: 9 }, label: { color: colors.navy, fontWeight: '700', fontSize: 13 }, input: { minHeight: 54, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 15, fontSize: 15, color: colors.navy }, multiline: { minHeight: 120, textAlignVertical: 'top' }, title: { fontSize: 28, lineHeight: 34, letterSpacing: -0.8, fontWeight: '800', color: colors.navy }, body: { fontSize: 14, lineHeight: 22, color: colors.slate }, note: { backgroundColor: colors.blueWash, padding: 16, borderRadius: 16 }, noteText: { color: colors.slate, fontSize: 12, lineHeight: 19 } });
