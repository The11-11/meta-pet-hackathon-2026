import { useMemo, type ComponentProps, type ReactNode } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThemeColors } from '../theme';
import { useTheme } from '../ThemeContext';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, color, size = 22 }: { name: IconName; color?: string; size?: number }) {
  const { colors } = useTheme();
  return <Ionicons name={name} color={color ?? colors.navy} size={size} />;
}

export function ScreenHeader({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  const { styles } = useStyles();
  return <View style={styles.header}>
    <View style={styles.headerCopy}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
    {action}
  </View>;
}

export function SectionTitle({ title, aside }: { title: string; aside?: string }) {
  const { styles } = useStyles();
  return <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{title}</Text>{aside ? <Text style={styles.aside}>{aside}</Text> : null}</View>;
}

export function IconButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { styles } = useStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><Icon name={icon} /></Pressable>;
}

export function ActionButton({ label, onPress, icon, tone = 'blue', disabled = false }: { label: string; onPress: () => void; icon?: IconName; tone?: 'blue' | 'violet' | 'navy'; disabled?: boolean }) {
  const { colors, styles } = useStyles();
  const backgroundColor = tone === 'violet' ? colors.actionViolet : tone === 'navy' ? colors.actionNavy : colors.actionBlue;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.actionButton, { backgroundColor }, disabled && styles.disabled, pressed && styles.pressed]}>
    <Text style={styles.actionLabel}>{label}</Text>{icon ? <Icon name={icon} size={19} color={colors.onAction} /> : null}
  </Pressable>;
}

export function Badge({ text, tone = 'blue' }: { text: string; tone?: 'blue' | 'violet' | 'gold' | 'mint' }) {
  const { colors, styles } = useStyles();
  const backgrounds = { blue: colors.blueWash, violet: colors.violetWash, gold: colors.goldWash, mint: colors.mintWash };
  const foregrounds = { blue: colors.blue, violet: colors.violet, gold: colors.navy, mint: colors.navy };
  return <View style={[styles.badge, { backgroundColor: backgrounds[tone] }]}><Text style={[styles.badgeText, { color: foregrounds[tone] }]}>{text}</Text></View>;
}

export function EmptyCard({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const { colors, styles } = useStyles();
  return <View style={styles.empty}><View style={styles.emptyIcon}><Icon name={icon} size={25} color={colors.blue} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyBody}>{body}</Text></View>;
}

function useStyles() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return { colors, styles };
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 24 },
  headerCopy: { flex: 1 }, eyebrow: { color: colors.blue, fontWeight: '700', fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  title: { fontSize: 31, lineHeight: 37, fontWeight: '800', color: colors.navy, letterSpacing: -1 },
  subtitle: { color: colors.slate, fontSize: 14, lineHeight: 21, marginTop: 6 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  sectionTitle: { color: colors.navy, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  aside: { color: colors.slate, fontSize: 12 },
  iconButton: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  actionButton: { minHeight: 50, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  actionLabel: { color: colors.onAction, fontWeight: '700', fontSize: 15, flexShrink: 1, textAlign: 'center' },
  badge: { alignSelf: 'flex-start', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 }, badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  empty: { padding: 22, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center' },
  emptyIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.blueWash, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.navy, textAlign: 'center' },
  emptyBody: { fontSize: 13, lineHeight: 20, color: colors.slate, textAlign: 'center', marginTop: 6, maxWidth: 330 },
  pressed: { opacity: 0.75 }, disabled: { opacity: 0.45 },
});
