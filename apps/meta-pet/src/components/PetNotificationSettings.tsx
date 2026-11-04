import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import type { ThemeColors } from '../theme';
import type { PetNotificationSound } from '../types';
import { FormNote } from './forms';
import { ActionButton, Icon, type IconName } from './ui';

export type PetNotificationSettingsProps = {
  petName: string;
  sound: PetNotificationSound;
  enabled: boolean;
  busy: boolean;
  message: string;
  error: string;
  onSelectSound: (sound: PetNotificationSound) => void;
  onPreviewSound: () => void;
  onToggleNotifications: () => void;
  onTestNotification: () => void;
  nativeAvailable: boolean;
};

const soundChoices: { value: PetNotificationSound; label: string; detail: string; icon: IconName }[] = [
  { value: 'bark', label: 'Bark', detail: 'A little woof', icon: 'paw-outline' },
  { value: 'meow', label: 'Meow', detail: 'A little meow', icon: 'paw' },
  { value: 'default', label: 'Default', detail: 'Device sound', icon: 'notifications-outline' },
  { value: 'silent', label: 'Quiet', detail: 'No sound', icon: 'volume-mute-outline' },
];

export function PetNotificationSettings({
  petName, sound, enabled, busy, message, error, onSelectSound, onPreviewSound,
  onToggleNotifications, onTestNotification, nativeAvailable,
}: PetNotificationSettingsProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const quiet = sound === 'silent';
  const name = petName.trim() || 'your pet';

  return <View style={styles.section}>
    <View style={styles.heading}>
      <View style={styles.eyebrowRow}>
        <Icon name="notifications-outline" color={colors.blue} size={18} />
        <Text style={styles.eyebrow}>PET CARE ALERTS</Text>
      </View>
      <Text accessibilityRole="header" style={styles.title}>A little woof. A little meow.</Text>
      <Text style={styles.body}>Choose how {name}’s care alerts sound.</Text>
    </View>

    <View accessibilityRole="radiogroup" accessibilityLabel="Pet care alert sound" style={styles.choices}>
      {soundChoices.map(choice => {
        const selected = sound === choice.value;
        return <Pressable key={choice.value} accessibilityRole="radio"
          accessibilityLabel={`${choice.label}, ${choice.detail}`}
          accessibilityState={{ checked: selected, selected, disabled: busy }} aria-checked={selected}
          disabled={busy} onPress={() => onSelectSound(choice.value)}
          style={({ pressed }) => [styles.choice, selected && styles.selectedChoice, pressed && styles.pressed, busy && styles.disabled]}>
          <View style={styles.choiceHeading}>
            <Icon name={choice.icon} color={selected ? colors.blue : colors.slate} size={22} />
            <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} color={selected ? colors.blue : colors.disabledIcon} size={18} />
          </View>
          <Text style={[styles.choiceLabel, selected && styles.selectedLabel]}>{choice.label}</Text>
          <Text style={styles.choiceDetail}>{choice.detail}</Text>
        </Pressable>;
      })}
    </View>

    <View style={styles.statusRow}>
      <Icon name={nativeAvailable && enabled ? 'checkmark-circle-outline' : 'information-circle-outline'} color={colors.slate} size={17} />
      <Text style={styles.statusLabel}>{nativeAvailable ? (enabled ? 'Phone alerts are on' : 'Phone alerts are off') : 'Web preview'}</Text>
    </View>

    <ActionButton label={enabled ? 'Turn off phone alerts' : 'Enable phone alerts'}
      tone="blue" icon={enabled ? 'notifications-off-outline' : 'notifications-outline'}
      disabled={busy || !nativeAvailable} onPress={onToggleNotifications} />

    <View style={styles.previewActions}>
      <View style={styles.previewAction}>
        <ActionButton label={quiet ? 'Quiet selected' : 'Listen'} tone="navy"
          icon={quiet ? 'volume-mute-outline' : 'volume-medium-outline'}
          disabled={busy || quiet} onPress={onPreviewSound} />
      </View>
      <View style={[styles.previewAction, !nativeAvailable && styles.webTestAction]}>
        <ActionButton label={nativeAvailable ? 'Test alert' : 'Preview test alert'} tone="violet"
          disabled={busy || (nativeAvailable && !enabled)} onPress={onTestNotification} />
      </View>
    </View>

    {nativeAvailable ? <Text style={styles.caption}>{enabled
      ? (quiet ? 'Quiet keeps care alerts silent. Send a test to check the alert.' : 'Listen to your selected sound or send a test care alert.')
      : 'Enable phone alerts to allow notifications from this app. You can listen to sounds before enabling them.'}</Text>
      : <FormNote>On this web preview, tests play in the app. Phone alerts need the mobile app.</FormNote>}
    {!!message && <View accessibilityLiveRegion="polite"><FormNote>{message}</FormNote></View>}
    {!!error && <FormNote error>{error}</FormNote>}
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  section: { gap: 14, padding: 18, borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  heading: { gap: 9 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eyebrow: { color: colors.blue, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  title: { color: colors.navy, fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.5 },
  body: { color: colors.slate, fontSize: 13, lineHeight: 21 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choice: { flexGrow: 1, flexBasis: '45%', minHeight: 86, padding: 12, borderRadius: 17, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cloud, gap: 3 },
  selectedChoice: { borderColor: colors.blue, backgroundColor: colors.blueWash },
  choiceHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  choiceLabel: { color: colors.navy, fontSize: 14, fontWeight: '700' },
  selectedLabel: { color: colors.blue },
  choiceDetail: { color: colors.slate, fontSize: 10, lineHeight: 15 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusLabel: { flex: 1, color: colors.slate, fontSize: 12, lineHeight: 18 },
  previewActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  previewAction: { flexGrow: 1, flexBasis: 148 },
  webTestAction: { flexBasis: 192 },
  caption: { color: colors.slate, fontSize: 11, lineHeight: 18 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
});
