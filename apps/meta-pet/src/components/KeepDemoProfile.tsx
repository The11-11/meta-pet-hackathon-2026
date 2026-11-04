import { Image } from 'expo-image';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import { careLabels, type ThemeColors } from '../theme';
import type { CareKind, PetProfile } from '../types';
import { FormNote, FormTitle } from './forms';
import { ActionButton, Badge, Icon } from './ui';

export type KeepDemoProfileProps = {
  pet: PetProfile;
  goals: CareKind[];
  accountName: string;
  existingPetName?: string;
  busy?: boolean;
  error?: string;
  onKeep: () => void;
  onSkip: () => void;
};

/** Review only: saving and fresh owner verification are handled by the account-scoped route. */
export function KeepDemoProfile({ pet, goals, accountName, existingPetName, busy = false, error = '', onKeep, onSkip }: KeepDemoProfileProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const name = pet.name.trim() || 'your pet';
  const existing = Boolean(existingPetName?.trim());
  return <>
    <FormTitle title={existing ? 'Your saved pet is safe.' : 'Keep ' + name + '’s profile?'} body={'You’re signed in with Facebook as ' + accountName + '.'} />
    <View style={styles.card}>
      <View style={styles.heading}><Icon name="paw-outline" color={colors.blue} size={25} /><View style={styles.headingCopy}><Text accessibilityRole="header" style={styles.name}>{name}</Text><Text style={styles.body}>{[pet.species, pet.breed, pet.age].filter(value => value.trim()).join(' · ')}</Text></View><Badge text="From your demo" tone="gold" /></View>
      {pet.avatar ? <Image source={{ uri: pet.avatar.uri }} accessible accessibilityLabel={name + '’s saved Muse avatar'} contentFit="contain" cachePolicy="memory" transition={0} style={styles.avatar} /> : null}
      {!!pet.careNeeds?.trim() && <View style={styles.detail}><Text style={styles.label}>Care needs and preferences</Text><Text style={styles.body}>{pet.careNeeds}</Text></View>}
      <View style={styles.detail}><Text style={styles.label}>Care goals</Text><View style={styles.goals}>{goals.map(goal => <Badge key={goal} text={careLabels[goal]} />)}</View></View>
    </View>
    {existing ? <FormNote>Your Facebook account already has {existingPetName} saved on this device. That profile will stay in place. {name}’s demo profile is unchanged.</FormNote> : <>
      <FormNote>Keep copies {name}’s pet details, saved Muse avatar and care goals into this Facebook account on this device. Care history, appointments, conversation, social pages, rewards and connection tokens are not copied. The original demo stays available.</FormNote>
      <Text style={styles.body}>Private Muse page memory starts with future signed-in care chats. Keeping a profile does not copy demo conversations into memory.</Text>
      <ActionButton label={busy ? 'Keeping profile…' : 'Keep ' + name + '’s profile'} icon="paw-outline" disabled={busy} onPress={onKeep} />
    </>}
    <ActionButton label={existing ? 'Continue existing profile' : 'Start fresh'} tone="navy" icon={existing ? 'arrow-forward-outline' : 'add-outline'} disabled={busy} onPress={onSkip} />
    {!existing && <Text style={styles.fine}>Start fresh opens pet setup for this account. It leaves the demo profile untouched.</Text>}
    {!!error && <FormNote error>{error}</FormNote>}
  </>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { padding: 18, gap: 18, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  heading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  headingCopy: { flex: 1, minWidth: 145, gap: 4 },
  name: { color: colors.navy, fontSize: 24, fontWeight: '800', lineHeight: 30 },
  body: { color: colors.slate, fontSize: 13, lineHeight: 21 },
  label: { color: colors.navy, fontWeight: '700', fontSize: 13, lineHeight: 20 },
  detail: { gap: 9 }, goals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fine: { color: colors.slate, fontSize: 11, lineHeight: 18 },
  avatar: { alignSelf: 'center', width: 210, height: 210, maxWidth: '100%', borderRadius: 24, backgroundColor: colors.blueWash },
});
