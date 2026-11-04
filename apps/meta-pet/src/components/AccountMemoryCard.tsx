import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import type { ThemeColors } from '../theme';
import { FormNote } from './forms';
import { ActionButton, Badge, Icon } from './ui';

export type AccountMemoryCardProps = {
  mode: 'demo' | 'facebook';
  accountName: string;
  petName: string;
  connectionLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  error?: string;
  onContinueFacebook: () => void;
  onViewMemory: () => void;
};

/** Account status is supplied by its verified owner; this card never tests or changes a session. */
export function AccountMemoryCard({ mode, accountName, petName, connectionLabel = 'Not tested', busy = false, disabled = false, error = '', onContinueFacebook, onViewMemory }: AccountMemoryCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const facebook = mode === 'facebook';
  const name = petName.trim() || 'your pet';
  return <View style={styles.card}>
    <View style={styles.heading}>
      <View style={styles.icon}><Icon name={facebook ? 'logo-facebook' : 'person-outline'} color={colors.blue} size={24} /></View>
      <View style={styles.headingCopy}><Text accessibilityRole="header" style={styles.title}>Account &amp; memory</Text><Text style={styles.body}>{accountName || 'Pet parent'}</Text></View>
      <Badge text={facebook ? 'Facebook signed in' : 'Demo profile'} tone={facebook ? 'mint' : 'gold'} />
    </View>
    <View style={styles.statusRow}><Text style={styles.label}>Muse</Text><Text style={styles.statusValue}>{connectionLabel}</Text></View>
    <View style={styles.statusRow}><Text style={styles.label}>Memory</Text><Text style={styles.statusValue}>{facebook ? 'Private account page memory' : 'Device-only demo'}</Text></View>
    <Text style={styles.body}>{facebook
      ? 'Care chats using your verified account can save private Muse page memory on this app’s server. Open memory to check what is saved. Your full care timeline stays on this device.'
      : name + '’s demo profile is saved on this device. Continue with Facebook, then choose whether to keep this pet’s profile. Nothing is copied until you choose.'}</Text>
    <ActionButton label={facebook ? 'View Muse page memory' : busy ? 'Opening Facebook…' : 'Continue with Facebook'} icon={facebook ? 'document-text-outline' : 'logo-facebook'} disabled={busy || disabled} onPress={facebook ? onViewMemory : onContinueFacebook} />
    {!!error && <FormNote error>{error}</FormNote>}
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { padding: 18, gap: 15, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  heading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 11 },
  icon: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.blueWash },
  headingCopy: { flex: 1, minWidth: 155, gap: 3 },
  title: { color: colors.navy, fontSize: 19, lineHeight: 25, fontWeight: '700' },
  body: { color: colors.slate, fontSize: 13, lineHeight: 21 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  label: { color: colors.navy, fontWeight: '700', fontSize: 13, lineHeight: 20 },
  statusValue: { flexShrink: 1, color: colors.slate, fontSize: 13, lineHeight: 20, textAlign: 'right' },
});
