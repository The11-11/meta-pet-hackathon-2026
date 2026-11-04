import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { AUTH_BASE_URL } from '../auth-client';
import { useAuth } from '../AuthContext';
import { useTheme } from '../ThemeContext';
import type { ThemeColors } from '../theme';
import { parseFacebookLocations, trainerArea, trainerGoals, trainerSearchLinks, type FacebookLocationSource, type TrainerGoal, type TrainerLocation } from '../trainerFinder';
import { Field, FormNote, FormTitle } from './forms';
import { ActionButton, Badge, Icon } from './ui';

type Props = { ownerScope: string; facebookReturnError: boolean };
type AreaSource = 'manual' | TrainerLocation['source'];
const permissionLabels = { profile: 'Share Facebook city', pages: 'Connect Facebook Page locations' };

export function TrainerFinder({ ownerScope, facebookReturnError }: Props) {
  const { owner, getMuseTransport, loginWithFacebook, connectFacebookLocation } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [goal, setGoal] = useState<TrainerGoal>('puppy');
  const [area, setArea] = useState('');
  const [areaSource, setAreaSource] = useState<AreaSource>('manual');
  const [locations, setLocations] = useState<TrainerLocation[]>([]);
  const [permissionSource, setPermissionSource] = useState<FacebookLocationSource | null>(null);
  const [pending, setPending] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(facebookReturnError ? 'Facebook could not finish sharing a location. You can try again or enter a city below.' : '');
  const active = useRef(true);
  const revision = useRef(0);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const latestScope = useRef(ownerScope);

  useEffect(() => {
    latestScope.current = ownerScope;
    active.current = true;
    return () => { active.current = false; revision.current += 1; controller.current?.abort(); };
  }, [ownerScope]);
  const isCurrent = (request: number, scope: string) => active.current && revision.current === request && latestScope.current === scope;
  const match = trainerGoals.find(item => item.id === goal) ?? trainerGoals[0];
  const chosenArea = trainerArea(area);

  async function loadLocations(source: FacebookLocationSource) {
    if (busy.current || owner?.mode !== 'facebook') return;
    busy.current = true;
    const scope = ownerScope;
    const expectedOwner = owner.id;
    const request = ++revision.current;
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 10000);
    setPending(source); setError(''); setMessage(''); setLocations([]); setPermissionSource(null);
    try {
      const transport = await getMuseTransport(AUTH_BASE_URL);
      if (!isCurrent(request, scope)) return;
      if (transport.headers?.['X-Muse-Owner'] !== expectedOwner) throw new Error('Verify your Facebook sign-in before reading a location.');
      const response = await fetch(AUTH_BASE_URL + '/api/facebook/location?source=' + source, { credentials: transport.credentials, headers: transport.headers, signal: abort.signal });
      if (!response.ok) throw new Error(response.status === 401 ? 'Your Facebook session needs to be verified again. Sign in and retry.' : 'Facebook locations could not load. Try again or enter a city below.');
      const result = parseFacebookLocations(await response.json(), source);
      if (!isCurrent(request, scope)) return;
      setLocations(result.locations);
      if (result.status === 'permission_required') {
        setPermissionSource(source);
        setMessage(source === 'profile' ? 'Facebook needs your permission to share your profile city.' : 'Facebook needs your permission to read locations from Pages you manage.');
      } else if (result.status === 'no_location') setMessage('No city was returned for this source. Choose another source or enter a city below.');
      else if (result.status === 'unavailable') setMessage('This Facebook location source is unavailable. You can still enter a city below.');
      else setMessage('Choose a city below. Only that area is used in your trainer search.');
    } catch (failure) {
      if (isCurrent(request, scope)) setError(failure instanceof Error && failure.name !== 'AbortError' ? failure.message : 'The location request timed out. Try again or enter a city below.');
    } finally {
      clearTimeout(timer);
      if (isCurrent(request, scope)) { busy.current = false; setPending(''); controller.current = null; }
    }
  }

  async function connect(source?: FacebookLocationSource) {
    if (busy.current) return;
    busy.current = true;
    const scope = ownerScope;
    const request = ++revision.current;
    setPending('connect'); setError('');
    try {
      if (source && owner?.mode === 'facebook') await connectFacebookLocation(source);
      else await loginWithFacebook();
      if (isCurrent(request, scope)) setMessage('After Facebook returns, choose a location source again to load its cities.');
    } catch {
      if (isCurrent(request, scope)) setError('Facebook could not complete the connection. You can retry or enter a city below.');
    } finally {
      if (isCurrent(request, scope)) { busy.current = false; setPending(''); }
    }
  }

  async function openSearch(destination: 'maps' | 'facebook') {
    if (busy.current) return;
    const links = trainerSearchLinks(area, goal);
    if (!links) { setError('Enter a city or choose a Facebook area first.'); return; }
    busy.current = true;
    const scope = ownerScope;
    const request = ++revision.current;
    setPending(destination); setError('');
    try {
      // Recheck the owner before sharing an area previously read from Facebook.
      if (areaSource !== 'manual') {
        const transport = await getMuseTransport(AUTH_BASE_URL);
        if (!isCurrent(request, scope)) return;
        if (owner?.mode !== 'facebook' || transport.headers?.['X-Muse-Owner'] !== owner.id) throw new Error('Your Facebook sign-in changed. Choose your city again.');
      }
      if (isCurrent(request, scope)) await Linking.openURL(links[destination]);
    } catch {
      if (isCurrent(request, scope)) setError('The search could not open. Check your sign-in or try another search.');
    } finally {
      if (isCurrent(request, scope)) { busy.current = false; setPending(''); }
    }
  }

  return <>
    <FormTitle title="A trainer for their next step." body="Muse suggests a trainer type for your goal. Choose a city, then compare local providers in Google Maps or Facebook." />
    <View style={styles.card}>
      <View style={styles.heading}><Icon name="location-outline" color={colors.blue} /><Text accessibilityRole="header" style={styles.title}>Choose your area</Text></View>
      <Text style={styles.body}>Use the city on your Facebook profile or a managed Page’s location. Nothing is read until you choose a source; no GPS or street address is requested.</Text>
      {owner?.mode === 'facebook' ? <>
        <ActionButton label="Use Facebook city" icon="logo-facebook" disabled={!!pending} onPress={() => void loadLocations('profile')} />
        <ActionButton label="Use Page location" icon="business-outline" tone="violet" disabled={!!pending} onPress={() => void loadLocations('pages')} />
      </> : <><Text style={styles.body}>The demo cannot read Facebook locations. Sign in to use your Facebook city or Page, or enter an area manually.</Text><ActionButton label="Sign in with Facebook" icon="logo-facebook" disabled={!!pending} onPress={() => void connect()} /></>}
      {!!pending && <View style={styles.heading}><ActivityIndicator size="small" color={colors.blue} /><Text style={styles.body}>Working on your request…</Text></View>}
      {!!message && <FormNote>{message}</FormNote>}
      {permissionSource ? <ActionButton label={permissionLabels[permissionSource]} icon="shield-checkmark-outline" disabled={!!pending} onPress={() => void connect(permissionSource)} /> : null}
      {locations.map(location => <Pressable key={location.id} accessibilityRole="button" accessibilityLabel={'Use ' + location.area + ' from ' + location.label} accessibilityState={{ selected: area === location.area && areaSource === location.source, disabled: !!pending }} disabled={!!pending} onPress={() => { setArea(location.area); setAreaSource(location.source); setError(''); }} style={({ pressed }) => [styles.location, area === location.area && areaSource === location.source && styles.selected, pressed && styles.pressed]}>
        <View style={styles.flex}><Text style={styles.locationTitle}>{location.label}</Text><Text style={styles.body}>{location.area}</Text></View><Icon name="arrow-down-outline" color={colors.blue} size={20} />
      </Pressable>)}
      <Field label="City or area" value={area} maxLength={100} onChange={value => { setArea(value); setAreaSource('manual'); }} placeholder="For example, Cape Town" />
      <Text style={styles.fine}>Location choices stay in this screen’s memory and clear when your account changes. They are not added to pet records or sent to the Muse model.</Text>
    </View>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>What would you like help with?</Text>
      <View style={styles.goals}>{trainerGoals.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: goal === item.id }} onPress={() => setGoal(item.id)} style={({ pressed }) => [styles.goal, goal === item.id && styles.selected, pressed && styles.pressed]}><Text style={styles.goalText}>{item.label}</Text></Pressable>)}</View>
      <Badge text="Muse’s match" tone="violet" />
      <Text accessibilityRole="header" style={styles.match}>{match.type}</Text>
      <Text style={styles.body}>{match.why}</Text>
      <Text style={styles.fine}>Ask about qualifications, humane reward-based methods, availability and a plan that suits your dog before booking.</Text>
    </View>
    <View style={styles.card}>
      <View style={styles.heading}><Icon name="search-outline" color={colors.violet} /><Text accessibilityRole="header" style={styles.title}>{chosenArea ? 'Search in ' + chosenArea : 'Explore trainers in your area'}</Text></View>
      <Text style={styles.body}>These open area searches, not verified trainer recommendations. Muse has not checked businesses, ratings, prices or availability.</Text>
      <ActionButton label="Search Google Maps" icon="map-outline" disabled={!chosenArea || !!pending} onPress={() => void openSearch('maps')} />
      <ActionButton label="Search Facebook trainer pages" icon="logo-facebook" tone="violet" disabled={!chosenArea || !!pending} onPress={() => void openSearch('facebook')} />
      <Text style={styles.fine}>Only your chosen area and the trainer goal’s search words go into these links. Facebook and Google may use your own account settings to personalise results.</Text>
    </View>
    {!!error && <FormNote error>{error}</FormNote>}
  </>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { padding: 18, gap: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  heading: { flexDirection: 'row', gap: 10, alignItems: 'center' }, flex: { flex: 1 },
  title: { flex: 1, color: colors.navy, fontSize: 18, lineHeight: 25, fontWeight: '700' }, body: { color: colors.slate, fontSize: 13, lineHeight: 21 }, fine: { color: colors.slate, fontSize: 11, lineHeight: 18 },
  location: { minHeight: 60, flexDirection: 'row', gap: 12, alignItems: 'center', padding: 13, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cloud }, locationTitle: { color: colors.navy, fontSize: 14, fontWeight: '700', lineHeight: 21 },
  goals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, goal: { minHeight: 46, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingVertical: 11, paddingHorizontal: 12 }, goalText: { color: colors.navy, fontWeight: '600', fontSize: 12 }, selected: { borderColor: colors.blue, backgroundColor: colors.blueWash },
  match: { color: colors.navy, fontSize: 21, lineHeight: 28, fontWeight: '800' }, pressed: { opacity: 0.7 },
});
