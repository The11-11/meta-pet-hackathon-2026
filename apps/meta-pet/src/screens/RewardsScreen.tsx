import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import type { ThemeColors } from '../theme';
import { useTheme } from '../ThemeContext';
import type { RewardEntry } from '../types';
import { ActionButton, Badge, EmptyCard, Icon, ScreenHeader, SectionTitle } from '../components/ui';

type Props = { entries: RewardEntry[]; onOpenShop: () => void };

export function RewardsScreen({ entries, onOpenShop }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const balance = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const recentEntries = [...entries].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <ScreenHeader eyebrow="Peta Coin" title="Little rewards. More care." subtitle="Explore how a pet community could unlock useful benefits." />
    <View style={styles.balanceCard}>
      <View style={styles.orbit} />
      <View style={styles.coin}><View style={styles.coinCenter}><Icon name="paw" size={35} color={colors.coinInk} /></View></View>
      <Badge text="Demo rewards" tone="gold" />
      <Text style={styles.balance}>{balance.toLocaleString()}</Text>
      <Text style={styles.unit}>Peta Coin demo credits</Text>
      <Text style={styles.balanceBody}>A local preview balance for trying the concept shop.</Text>
      <View style={styles.buttonWrap}><ActionButton label="Explore demo rewards" icon="arrow-forward" tone="navy" onPress={onOpenShop} /></View>
    </View>
    <View style={styles.noteCard}><View style={styles.noteIcon}><Icon name="information-circle-outline" size={23} color={colors.blue} /></View><View style={styles.flex}><Text style={styles.noteTitle}>A concept you can try safely</Text><Text style={styles.noteBody}>These are demonstration credits. They have no cash value, are not cryptocurrency, and cannot be spent on Facebook Marketplace.</Text></View></View>
    <View style={styles.section}>
      <SectionTitle title="Your demo activity" aside={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`} />
      {recentEntries.length ? <View style={styles.ledger}>{recentEntries.map((entry) => {
        const date = new Date(entry.createdAt);
        const dateLabel = Number.isNaN(date.getTime()) ? 'Recorded' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return <View key={entry.id} style={styles.ledgerRow}><View style={[styles.entryIcon, { backgroundColor: entry.amount >= 0 ? colors.mintWash : colors.goldWash }]}><Icon name={entry.amount >= 0 ? 'gift-outline' : 'bag-outline'} color={colors.navy} size={22} /></View><View style={styles.flex}><Text style={styles.entryTitle}>{entry.label}</Text><Text style={styles.entryDate}>{dateLabel} · Demo ledger</Text></View><Text style={styles.entryAmount}>{entry.amount > 0 ? '+' : ''}{entry.amount}</Text></View>;
      })}</View> : <EmptyCard icon="gift-outline" title="Your demo ledger is empty" body="Concept-shop redemptions and demonstration credits will appear here." />}
    </View>
    <View style={styles.futureCard}><Icon name="sparkles-outline" color={colors.violet} size={25} /><Text style={styles.futureTitle}>A community around their progress</Text><Text style={styles.futureBody}>Pet profiles, owner-approved milestones, and participating-seller rewards are part of the vision. Social accounts and merchant acceptance are not connected yet.</Text></View>
  </ScrollView>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cloud }, content: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 32, width: '100%', maxWidth: 760, alignSelf: 'center' }, flex: { flex: 1 },
  balanceCard: { backgroundColor: colors.rewardPanel, borderRadius: 28, padding: 24, overflow: 'hidden', alignItems: 'center', position: 'relative' }, orbit: { position: 'absolute', width: 330, height: 330, borderRadius: 165, borderWidth: 1, borderColor: '#FFFFFF16', top: -120, right: -140 }, coin: { width: 81, height: 81, borderRadius: 41, borderWidth: 2, borderColor: '#F1C66B88', backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }, coinCenter: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: '#071B3F33', alignItems: 'center', justifyContent: 'center' },
  balance: { color: colors.onAction, fontSize: 58, fontWeight: '800', letterSpacing: -2, marginTop: 17, fontVariant: ['tabular-nums'] }, unit: { color: colors.onAction, fontWeight: '600', fontSize: 14 }, balanceBody: { color: colors.onDarkSecondary, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 9, maxWidth: 250 }, buttonWrap: { width: '100%', marginTop: 22, borderWidth: 1, borderColor: '#FFFFFF30', borderRadius: 17 },
  noteCard: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 17, borderRadius: 20, backgroundColor: colors.blueWash, marginTop: 18 }, noteIcon: { marginTop: 2 }, noteTitle: { color: colors.navy, fontWeight: '700', fontSize: 13 }, noteBody: { color: colors.slate, fontSize: 12, lineHeight: 19, marginTop: 5 }, section: { marginTop: 28 },
  ledger: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16 }, ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 17, borderBottomWidth: 1, borderBottomColor: colors.cloud }, entryIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, entryTitle: { color: colors.navy, fontSize: 13, fontWeight: '600', lineHeight: 19 }, entryDate: { color: colors.slate, fontSize: 11, marginTop: 4 }, entryAmount: { color: colors.navy, fontWeight: '800', fontSize: 17, fontVariant: ['tabular-nums'] },
  futureCard: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 22, padding: 22, marginTop: 24 }, futureTitle: { color: colors.navy, fontSize: 17, lineHeight: 23, fontWeight: '700', marginTop: 12 }, futureBody: { color: colors.slate, fontSize: 12, lineHeight: 20, marginTop: 8 },
});

