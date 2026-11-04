import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMemo, useRef } from 'react';
import { MuseJourneyGuide } from '../components/MuseJourneyGuide';
import { careLabels, type ThemeColors } from '../theme';
import { useTheme } from '../ThemeContext';
import { PetMuseAvatar } from '../components/PetMuseAvatar';
import type { Appointment, CareKind, CareLog, PetProfile } from '../types';
import { Badge, EmptyCard, Icon, IconButton, ScreenHeader, SectionTitle, type IconName } from '../components/ui';

type Props = {
  pet: PetProfile; logs: CareLog[]; appointments: Appointment[]; goals?: CareKind[];
  onLog: (type: CareKind) => void; onOpenMuse: () => void; onOpenCollar: () => void;
  onAddAppointment: () => void; onEditPet: () => void;
  backendUrl?: string;
};

const routineItems: { type: CareKind; icon: IconName; detail: string; background: 'mintWash' | 'blueWash' | 'violetWash' }[] = [
  { type: 'feeding', icon: 'restaurant-outline', detail: 'Meals & portions', background: 'mintWash' },
  { type: 'walk', icon: 'walk-outline', detail: 'Fresh air & activity', background: 'blueWash' },
  { type: 'training', icon: 'school-outline', detail: 'Little wins together', background: 'violetWash' },
  { type: 'sleep', icon: 'moon-outline', detail: 'Rest observations', background: 'blueWash' },
];

const careIcons: Record<CareKind, IconName> = { feeding: 'restaurant-outline', walk: 'walk-outline', training: 'school-outline', sleep: 'moon-outline', vet: 'medkit-outline' };

function logTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recorded' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function appointmentDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function CareScreen({ pet, logs, appointments, goals = [], onLog, onOpenMuse, onOpenCollar, onAddAppointment, onEditPet, backendUrl = '' }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scroll = useRef<ScrollView>(null);
  const timelineY = useRef(0);
  const today = new Date().toDateString();
  const todayLogs = logs.filter((entry) => new Date(entry.recordedAt).toDateString() === today);
  const recentLogs = [...logs].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()).slice(0, 5);
  const upcomingAppointments = [...appointments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return <ScrollView ref={scroll} style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <ScreenHeader eyebrow="Meta Pet" title="Care, together." subtitle="Your pet’s companion" action={<IconButton icon="person-outline" label="Edit pet profile" onPress={onEditPet} />} />

    <View style={styles.petHero}>
      <View style={styles.heroOrbit} />
      <View style={[styles.heroCopy, pet.avatar && styles.customHeroCopy]}>
        <Badge text={pet.id === 'demo-pet' ? 'Demo pet' : 'Pet profile'} />
        <Text style={styles.petName}>{pet.name}</Text>
        <Text style={styles.petDescription}>{pet.breed || pet.species}{pet.age ? ` · ${pet.age}` : ''}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${pet.name}'s profile`} onPress={onEditPet} style={styles.profileLink}><Text style={styles.profileLinkText}>View profile</Text><Icon name="arrow-forward" size={16} color={colors.blue} /></Pressable>
      </View>
      <PetMuseAvatar avatar={pet.avatar} style={[styles.mascot, pet.avatar && styles.customMascot]} />
    </View>

    <MuseJourneyGuide data={{ pet, logs, appointments, backendUrl }} onOpenMuse={onOpenMuse} onOpenTimeline={() => scroll.current?.scrollTo({ y: timelineY.current, animated: true })} />

    {!!goals.length && <View style={styles.careFocus}><Text style={styles.careFocusLabel}>YOUR CARE FOCUS</Text><View style={styles.careFocusItems}>{goals.map(goal => <Badge key={goal} text={careLabels[goal]} />)}</View></View>}

    <Pressable accessibilityRole="button" accessibilityLabel="Open Muse Pet companion" onPress={onOpenMuse} style={({ pressed }) => [styles.museCard, pressed && styles.pressed]}>
      <View style={styles.museIcon}><Icon name="sparkles-outline" color={colors.onAction} size={25} /></View>
      <View style={styles.museText}><Text style={styles.museTitle}>A little help from Muse</Text><Text style={styles.museBody}>Make sense of care notes and plan your next check-in.</Text></View>
      <Icon name="chevron-forward" color={colors.onAction} size={22} />
    </Pressable>

    <View style={styles.section}>
      <SectionTitle title="Today’s little moments" aside={`${todayLogs.length} recorded`} />
      <View style={styles.routineGrid}>
        {routineItems.map((item) => {
          const count = todayLogs.filter((entry) => entry.type === item.type).length;
          return <Pressable key={item.type} accessibilityRole="button" accessibilityLabel={`Record ${careLabels[item.type].toLowerCase()}`} onPress={() => onLog(item.type)} style={({ pressed }) => [styles.routineCard, pressed && styles.pressed]}>
            <View style={[styles.routineIcon, { backgroundColor: colors[item.background] }]}><Icon name={item.icon} size={24} color={item.type === 'training' ? colors.violet : colors.blue} /></View>
            <Text style={styles.routineTitle}>{careLabels[item.type]}</Text>
            <Text style={styles.routineDescription}>{item.detail}</Text>
            <View style={styles.routineFooter}><Text style={styles.routineCount}>{count ? `${count} recorded` : 'Add a moment'}</Text><Icon name="add-circle-outline" size={22} color={colors.blue} /></View>
          </Pressable>;
        })}
      </View>
      <Text style={styles.evidenceNote}>Your entries are care records. An empty log means nothing has been recorded yet.</Text>
    </View>

    <Pressable accessibilityRole="button" accessibilityLabel="View collar connection options" onPress={onOpenCollar} style={({ pressed }) => [styles.collarCard, pressed && styles.pressed]}>
      <View style={styles.collarIcon}><Icon name="bluetooth-outline" size={25} color={colors.blue} /></View>
      <View style={styles.flex}><Text style={styles.cardTitle}>A connection to home</Text><Text style={styles.cardBody}>No collar connected. Explore the two-way audio concept.</Text></View>
      <Icon name="chevron-forward" size={20} color={colors.slate} />
    </Pressable>

    <View style={styles.section}>
      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Vet appointments</Text><Pressable accessibilityRole="button" accessibilityLabel="Add a vet appointment" onPress={onAddAppointment} style={styles.smallAction}><Icon name="add" size={18} color={colors.blue} /><Text style={styles.smallActionText}>Add</Text></Pressable></View>
      {upcomingAppointments.length ? <View style={styles.listCard}>{upcomingAppointments.map((appointment) => <View key={appointment.id} style={styles.listRow}><View style={styles.listIcon}><Icon name="calendar-outline" color={colors.blue} /></View><View style={styles.flex}><Text style={styles.cardTitle}>{appointment.title}</Text><Text style={styles.cardBody}>{appointmentDate(appointment.date)}</Text>{appointment.note ? <Text style={styles.note} numberOfLines={2}>{appointment.note}</Text> : null}</View></View>)}</View> : <EmptyCard icon="calendar-outline" title="Make room for their next visit" body="Add a vet appointment so their care plans stay in one place." />}
      <Pressable accessibilityRole="button" accessibilityLabel="Record a completed vet visit" onPress={() => onLog('vet')} style={styles.textAction}><Text style={styles.textActionText}>Record a completed visit</Text><Icon name="arrow-forward" size={16} color={colors.blue} /></Pressable>
    </View>

    <View style={styles.section} onLayout={event => { timelineY.current = event.nativeEvent.layout.y; }}>
      <SectionTitle title="Care timeline" aside="Owner-recorded" />
      {recentLogs.length ? <View style={styles.listCard}>{recentLogs.map((log) => <View key={log.id} style={styles.listRow}><View style={styles.listIcon}><Icon name={careIcons[log.type]} color={colors.blue} /></View><View style={styles.flex}><Text style={styles.cardTitle}>{log.label || careLabels[log.type]}</Text>{log.note ? <Text style={styles.note} numberOfLines={2}>{log.note}</Text> : null}<Text style={styles.timestamp}>{logTime(log.recordedAt)}</Text></View><Icon name="checkmark-circle-outline" size={20} color={colors.slate} /></View>)}</View> : <EmptyCard icon="paw-outline" title="Their story starts with a moment" body="Record a meal, walk, training session, or rest observation. Muse can use your notes to help you reflect." />}
    </View>
    <Text style={styles.footer}>Built around real care. Wearable measurements appear only when a supported device is connected.</Text>
  </ScrollView>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cloud }, content: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 32, width: '100%', maxWidth: 760, alignSelf: 'center' },
  petHero: { backgroundColor: colors.blueWash, minHeight: 205, borderRadius: 28, overflow: 'hidden', position: 'relative', flexDirection: 'row', alignItems: 'center', padding: 22, marginBottom: 16 },
  heroOrbit: { position: 'absolute', width: 230, height: 230, borderRadius: 115, borderWidth: 28, borderColor: colors.heroOrbit, right: -65, top: -30 },
  heroCopy: { flex: 1, paddingRight: 112, zIndex: 1 }, petName: { color: colors.navy, fontSize: 34, lineHeight: 42, fontWeight: '800', letterSpacing: -1, marginTop: 12 },
  customHeroCopy: { paddingRight: 150 },
  petDescription: { color: colors.slate, fontSize: 13, lineHeight: 19, maxWidth: 180 }, profileLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 }, profileLinkText: { color: colors.blue, fontSize: 13, fontWeight: '700' },
  mascot: { width: 200, height: 205, position: 'absolute', right: -10, bottom: -9 },
  customMascot: { width: 160, height: 190, right: 2, bottom: 4 },
  careFocus: { marginBottom: 20, gap: 9 }, careFocusLabel: { color: colors.slate, fontSize: 10, fontWeight: '700', letterSpacing: 1.1 }, careFocusItems: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  museCard: { borderRadius: 22, backgroundColor: colors.actionViolet, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 13 }, museIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF20' }, museText: { flex: 1 }, museTitle: { color: colors.onAction, fontWeight: '700', fontSize: 16 }, museBody: { color: colors.onAction, fontSize: 12, lineHeight: 18, marginTop: 4 },
  section: { marginTop: 28 }, routineGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, routineCard: { flexBasis: '46%', flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 22, padding: 16, minHeight: 165 }, routineIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  routineTitle: { color: colors.navy, fontWeight: '700', fontSize: 16 }, routineDescription: { color: colors.slate, fontSize: 12, lineHeight: 18, marginTop: 4 }, routineFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 14 }, routineCount: { color: colors.blue, fontSize: 11, fontWeight: '600' },
  evidenceNote: { color: colors.slate, fontSize: 11, lineHeight: 17, marginTop: 10 }, collarCard: { marginTop: 24, flexDirection: 'row', gap: 13, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 22, padding: 17 }, collarIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.blueWash },
  flex: { flex: 1 }, cardTitle: { color: colors.navy, fontSize: 14, fontWeight: '700', lineHeight: 20 }, cardBody: { color: colors.slate, fontSize: 12, lineHeight: 18, marginTop: 3 }, note: { color: colors.slate, fontSize: 13, lineHeight: 19, marginTop: 3 }, timestamp: { color: colors.slate, fontSize: 11, marginTop: 6 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, sectionTitle: { color: colors.navy, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 }, smallAction: { flexDirection: 'row', gap: 4, alignItems: 'center', minHeight: 44, paddingHorizontal: 8 }, smallActionText: { color: colors.blue, fontWeight: '700', fontSize: 13 },
  listCard: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16 }, listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.cloud }, listIcon: { width: 42, height: 42, backgroundColor: colors.blueWash, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  textAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 5 }, textActionText: { color: colors.blue, fontSize: 12, fontWeight: '600' }, footer: { fontSize: 11, lineHeight: 17, color: colors.slate, marginTop: 28, textAlign: 'center', paddingHorizontal: 10 }, pressed: { opacity: 0.76 },
});




