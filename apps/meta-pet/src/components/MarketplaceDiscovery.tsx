import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCare } from '../CareContext';
import { marketplaceIdeas, type MarketplaceIdea } from '../marketplace';
import { useTheme } from '../ThemeContext';
import type { ThemeColors } from '../theme';
import { ActionButton, Badge, Icon, type IconName } from './ui';

const icons: Record<MarketplaceIdea['id'], IconName> = { feeding: 'restaurant-outline', walk: 'compass-outline', training: 'sparkles-outline', sleep: 'moon-outline' };

export function MarketplaceDiscovery() {
  const { data } = useCare();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const ideas = marketplaceIdeas(data.pet, data.onboarding?.goals);
  const [opening, setOpening] = useState<string>();
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  async function openSearch(idea: MarketplaceIdea) {
    if (inFlight.current) return;
    inFlight.current = true;
    setOpening(idea.id);
    setError('');
    try { await Linking.openURL(idea.url); }
    catch { setError('Facebook Marketplace could not open. Try again, or search for “' + idea.query + '” in Facebook.'); }
    finally { inFlight.current = false; setOpening(undefined); }
  }

  return <View style={styles.section}>
    <View style={styles.heading}>
      <View style={styles.spark}><Icon name="sparkles-outline" size={25} color={colors.violet} /></View>
      <View style={styles.flex}><Text style={styles.eyebrow}>MUSE’S SUPPLY FINDER</Text><Text accessibilityRole="header" style={styles.title}>Little finds for {data.pet.name}.</Text></View>
    </View>
    <Text style={styles.body}>Start with {data.pet.species.toLowerCase() === 'dog' ? 'dog' : data.pet.species.toLowerCase() === 'cat' ? 'cat' : 'pet'} supplies, with your selected care goals first. Compare offers and prices in Facebook Marketplace.</Text>
    <View style={styles.note}><Icon name="logo-facebook" color={colors.blue} size={20} /><Text style={styles.noteText}>Search suggestions, not live listings. Availability, prices and suitability are unverified. Facebook may ask you to sign in.</Text></View>
    {ideas.map(idea => <View key={idea.id} style={styles.card}>
      <View style={styles.cardHeading}><View style={styles.cardIcon}><Icon name={icons[idea.id]} color={colors.blue} size={23} /></View><View style={styles.flex}><Text accessibilityRole="header" style={styles.cardTitle}>{idea.title}</Text><Text style={styles.query}>{idea.query}</Text></View><Badge text="Search idea" tone="mint" /></View>
      <Text style={styles.body}>{idea.reason}</Text>
      <Text style={styles.check}>{idea.check}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={'Search Facebook Marketplace for ' + idea.query} accessibilityState={{ disabled: !!opening }} disabled={!!opening} onPress={() => void openSearch(idea)} style={({ pressed }) => [styles.search, (pressed || !!opening) && styles.pressed]}><Text style={styles.searchText}>{opening === idea.id ? 'Opening…' : 'Search Marketplace'}</Text><Icon name="open-outline" color={colors.blue} size={18} /></Pressable>
    </View>)}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Text style={styles.fine}>Only the product search words above go to Facebook. Your pet’s name, care notes and appointments stay out of the search link. Set location and price filters on Facebook.</Text>
    <ActionButton label="Ask Muse what to look for" icon="chatbubble-ellipses-outline" tone="violet" onPress={() => router.push('/muse')} />
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  section: { gap: 14, marginBottom: 30 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 13 }, flex: { flex: 1 }, spark: { width: 50, height: 50, borderRadius: 18, backgroundColor: colors.violetWash, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: colors.violet, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }, title: { color: colors.navy, fontSize: 26, lineHeight: 32, letterSpacing: -0.7, fontWeight: '800', marginTop: 5 }, body: { color: colors.slate, fontSize: 13, lineHeight: 21 },
  note: { flexDirection: 'row', gap: 10, padding: 15, borderRadius: 17, backgroundColor: colors.blueWash, alignItems: 'flex-start' }, noteText: { color: colors.slate, fontSize: 12, lineHeight: 19, flex: 1 },
  card: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 17, gap: 11 }, cardHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }, cardIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.blueWash, alignItems: 'center', justifyContent: 'center' }, cardTitle: { color: colors.navy, fontSize: 16, lineHeight: 22, fontWeight: '700' }, query: { color: colors.blue, fontSize: 12, lineHeight: 19, marginTop: 2 },
  check: { color: colors.slate, fontSize: 12, lineHeight: 19 }, search: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderColor: colors.line, paddingTop: 12 }, searchText: { color: colors.blue, fontSize: 13, fontWeight: '700' }, fine: { color: colors.slate, fontSize: 11, lineHeight: 18 }, error: { color: colors.danger, fontSize: 12, lineHeight: 19 }, pressed: { opacity: 0.6 },
});
