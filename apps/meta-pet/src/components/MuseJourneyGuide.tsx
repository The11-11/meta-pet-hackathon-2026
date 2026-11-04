import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { careReviewDraft, museGuideProgress, submitCareReview } from '../museGuide';
import { useTheme } from '../ThemeContext';
import type { ThemeColors } from '../theme';
import type { AppData } from '../types';
import { Field, FormNote } from './forms';
import { ActionButton, Icon } from './ui';

type Props = {
  data: Pick<AppData, 'pet' | 'logs' | 'appointments' | 'backendUrl'>;
  busy?: boolean;
  onOpenMuse?: () => void;
  onOpenTimeline?: () => void;
  onAsk?: (message: string) => Promise<void>;
};

export function MuseJourneyGuide({ data, busy = false, onOpenMuse, onOpenTimeline, onAsk }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [kind, setKind] = useState<'feeding' | 'walk'>('feeding');
  const [description, setDescription] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const review = careReviewDraft(kind, description);
  const visibleError = reviewError || (description.trim() && !review.request ? review.error : '');
  const progress = museGuideProgress(data);
  const petName = data.pet.name.trim() || 'your pet';
  async function reviewCare() {
    if (busy || !onAsk) return;
    setReviewError(await submitCareReview(kind, description, onAsk));
  }
  return <View style={styles.card}>
    <View style={styles.heading}><Icon name="sparkles-outline" color={colors.violet} size={22} /><Text accessibilityRole="header" style={styles.title}>Let Muse guide you</Text></View>
    <Text style={styles.step}>{progress.hasCareEntry ? 'NEXT · SEE IT COME TOGETHER' : 'NEXT · YOUR FIRST CARE MOMENT'}</Text>
    <Text style={styles.body}>{progress.hasCareEntry
      ? petName + ' has ' + progress.savedCareCount + (progress.savedCareCount === 1 ? ' saved care entry. ' : ' saved care entries. ') + 'Let’s look at the timeline, then find useful supplies or local support.'
      : 'I’ll walk you through it. Tell me about a real meal or walk for ' + petName + '. We’ll review the details together before anything is saved.'}</Text>
    {!progress.hasCareEntry && !onAsk && onOpenMuse ? <ActionButton label="Start with Muse" icon="chatbubble-ellipses-outline" tone="violet" onPress={onOpenMuse} /> : null}
    {!progress.hasCareEntry && onAsk ? <View style={styles.form}>
      <View style={styles.choices}>{(['feeding', 'walk'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={value === 'feeding' ? 'Guide me through a meal' : 'Guide me through a walk'} accessibilityState={{ checked: kind === value, disabled: busy }} disabled={busy} onPress={() => { setKind(value); setReviewError(''); }} style={[styles.choice, kind === value && styles.selected]}><Icon name={value === 'feeding' ? 'restaurant-outline' : 'walk-outline'} color={colors.violet} size={18} /><Text style={styles.choiceText}>{value === 'feeding' ? 'A meal' : 'A walk'}</Text></Pressable>)}</View>
      <Field label={kind === 'feeding' ? 'What did your pet eat?' : 'Tell me about the walk'} value={description} onChange={value => { if (!busy) { setDescription(value); setReviewError(''); } }} placeholder={kind === 'feeding' ? 'Describe a meal that happened' : 'Describe a walk that happened'} maxLength={600} />
      <ActionButton label={busy ? 'Muse is preparing your review…' : 'Review this with Muse'} icon="arrow-forward" tone="violet" disabled={busy || !review.request} onPress={() => { void reviewCare(); }} />
      <Text style={styles.fine}>Use 1–120 characters to describe what happened. Shorten longer descriptions before asking Muse to review.</Text>
      {visibleError ? <FormNote error>{visibleError}</FormNote> : null}
      <Text style={styles.fine}>Muse proposes an entry. Choose Approve on its review card to save it, or dismiss it.</Text>
    </View> : null}
    {progress.hasCareEntry ? <View style={styles.form}>
      <ActionButton label="See the care timeline" icon="list-outline" tone="violet" onPress={onOpenTimeline || (() => router.push('/'))} />
      <ActionButton label="Explore pet-friendly supplies" icon="bag-handle-outline" onPress={() => router.push('/shop')} />
      {data.pet.species.toLowerCase() === 'dog' ? <ActionButton label="Find local dog trainers" icon="school-outline" onPress={() => router.push('/trainers')} /> : null}
      {!progress.upcomingAppointments ? <ActionButton label="Plan a vet appointment" icon="calendar-outline" onPress={() => router.push('/appointment')} /> : null}
      <Text style={styles.fine}>Product listings and trainers are yours to review. Purchases and bookings stay in your control.</Text>
    </View> : null}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showHelp }} onPress={() => setShowHelp(value => !value)} style={styles.helpButton}><Text style={styles.helpLabel}>{showHelp ? 'Hide Muse’s tip' : 'What happens next?'}</Text><Icon name={showHelp ? 'chevron-up' : 'chevron-down'} size={17} color={colors.violet} /></Pressable>
    {showHelp ? <Text accessibilityLiveRegion="polite" style={styles.body}>{data.backendUrl
      ? 'Care messages use your configured Muse connection. You can ask questions freely, and every proposed care action still needs your approval.'
      : 'I’m the interactive preview guide here. Your profile, care entries and chat stay in this browser. You can revisit them after refreshing; live AI and Facebook memory need a connected backend.'}</Text> : null}
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { marginTop: 16, padding: 18, gap: 13, borderRadius: 23, backgroundColor: colors.violetWash, borderWidth: 1, borderColor: colors.line },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 9 }, title: { flex: 1, color: colors.navy, fontSize: 19, lineHeight: 25, fontWeight: '800' },
  step: { color: colors.violet, fontSize: 10, letterSpacing: 1, lineHeight: 16, fontWeight: '700' }, body: { color: colors.slate, fontSize: 13, lineHeight: 21 },
  form: { gap: 12 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, choice: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }, selected: { borderColor: colors.violet }, choiceText: { color: colors.navy, fontSize: 13, fontWeight: '600' },
  fine: { color: colors.slate, fontSize: 11, lineHeight: 17 }, helpButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }, helpLabel: { color: colors.violet, fontSize: 13, fontWeight: '700' },
});
