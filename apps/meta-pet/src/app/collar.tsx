import { StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { MuseDog } from '../components/MuseDog';
import { ProductVisual } from '../components/ProductVisual';
import { router } from 'expo-router';
import { ActionButton, Icon } from '../components/ui';
import { FormNote, FormPage, FormTitle } from '../components/forms';
import type { ThemeColors } from '../theme';
import { useTheme } from '../ThemeContext';

export default function CollarRoute() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <FormPage><ProductVisual product={{ id: 'collar', name: 'Companion collar' }} detail /><FormTitle title="Their companion. Your connection." body="A proposed collar with a microphone, speaker and network connection could let you check in from your desk." /><FormNote>No collar is connected. This app does not currently listen, record audio, track location, measure vital signs or play sound to your pet.</FormNote>{[{ icon: 'mic-outline' as const, title: 'Listen when you choose', body: 'Owner-controlled sessions with clear recording and mute controls.' }, { icon: 'volume-high-outline' as const, title: 'A familiar voice', body: 'Two-way audio needs a speaker as well as a microphone.' }, { icon: 'shield-checkmark-outline' as const, title: 'Evidence you can understand', body: 'Future readings will show the device, time and measurement limitations.' }].map(item => <View key={item.title} style={styles.row}><Icon name={item.icon} color={colors.violet} size={25} /><View style={{ flex: 1, gap: 5 }}><Text style={styles.title}>{item.title}</Text><Text style={styles.body}>{item.body}</Text></View></View>)}<MuseDog style={styles.dog} /><ActionButton label="Back to Muse Pet" tone="violet" onPress={() => router.replace('/muse')} icon="sparkles-outline" /></FormPage>;
}
const createStyles = (colors: ThemeColors) => StyleSheet.create({ dog: { width: '100%', height: 140 }, row: { flexDirection: 'row', gap: 15, padding: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 20 }, title: { color: colors.navy, fontSize: 15, fontWeight: '700' }, body: { color: colors.slate, fontSize: 13, lineHeight: 20 } });

