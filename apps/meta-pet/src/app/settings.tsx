import { useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../AuthContext';
import { useCare } from '../CareContext';
import { ActionButton, Icon } from '../components/ui';
import { Field, FormNote, FormPage, FormTitle } from '../components/forms';
import { AppearanceSettings } from '../components/AppearanceSettings';
import { useTheme } from '../ThemeContext';
import { testMuseConnection } from '../muse';
import type { ThemeColors } from '../theme';
import { PetNotificationSettings } from '../components/PetNotificationSettings';
import { WhatsAppSettings } from '../components/WhatsAppSettings';
import { AccountMemoryCard } from '../components/AccountMemoryCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearDemoProfileHandoff } from '../demoProfileHandoff';
import { usePetNotifications } from '../PetNotificationContext';

export default function SettingsRoute() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { owner, signOut, getMuseTransport, loginWithFacebook } = useAuth();
  const { data, updatePet, setConnection, clientToken, reset, getMuseSession, prepareFacebookProfile } = useCare();
  const notifications = usePetNotifications();
  const [name, setName] = useState(data.pet.name);
  const [breed, setBreed] = useState(data.pet.breed);
  const [age, setAge] = useState(data.pet.age);
  const [careNeeds, setCareNeeds] = useState(data.pet.careNeeds ?? '');
  const [url, setUrl] = useState(data.backendUrl);
  const [token, setToken] = useState(clientToken);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [accountError, setAccountError] = useState('');
  const [connectingFacebook, setConnectingFacebook] = useState(false);
  const [verifiedConnection, setVerifiedConnection] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savingConnection, setSavingConnection] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [resetting, setResetting] = useState(false);
  const signOutInFlight = useRef(false);
  const connectionInFlight = useRef(false);
  const profileSaveInFlight = useRef(false);
  const facebookConnected = owner?.mode === 'facebook';
  const connectionBusy = testing || savingConnection;
  const accountBusy = signingOut || connectingFacebook || resetting;


  async function connectFacebook() {
    if (owner?.mode !== 'demo' || signOutInFlight.current || connectionInFlight.current || profileSaveInFlight.current) return;
    signOutInFlight.current = true; setConnectingFacebook(true); setAccountError('');
    let handoffId: string | undefined;
    try {
      if (!name.trim()) throw new Error('Enter a pet name before connecting Facebook.');
      await updatePet({ ...data.pet, name: name.trim(), breed: breed.trim(), age: age.trim(), careNeeds: careNeeds.trim() || undefined });
      handoffId = await prepareFacebookProfile();
      await loginWithFacebook(handoffId);
    } catch (failure) {
      if (handoffId) await clearDemoProfileHandoff(AsyncStorage, handoffId).catch(() => {});
      setAccountError(failure instanceof Error ? failure.message : 'Facebook could not open. Your demo profile is still saved here.');
    } finally { signOutInFlight.current = false; setConnectingFacebook(false); }
  }

  async function leaveAccount() {
    if (signOutInFlight.current || profileSaveInFlight.current) return;
    signOutInFlight.current = true;
    setSigningOut(true);
    setAccountError('');
    try {
      await signOut();
    } catch {
      setAccountError(facebookConnected ? 'Could not sign out. Please try again.' : 'Could not leave the demo. Please try again.');
    } finally {
      signOutInFlight.current = false;
      setSigningOut(false);
    }
  }

  async function saveConnection() {
    if (signOutInFlight.current || connectionInFlight.current || profileSaveInFlight.current) return;
    setError('');
    setMessage('');
    if (url.trim()) {
      try {
        const parsed = new URL(url.trim());
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error();
      } catch {
        setError('Enter a valid http or https connection address without credentials, query or fragment.');
        return;
      }
    }
    connectionInFlight.current = true;
    setSavingConnection(true);
    try {
      await setConnection(url, token);
      setMessage(url.trim() ? 'Connection activated for this app session. Send a message or test the connection.' : 'Preview guide selected.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the Muse connection. Please try again.');
    } finally {
      connectionInFlight.current = false;
      setSavingConnection(false);
    }
  }

  async function testConnection() {
    if (signOutInFlight.current || connectionInFlight.current || profileSaveInFlight.current) return;
    setError('');
    setMessage('');
    try {
      const parsed = new URL(url.trim());
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Enter a valid Muse server address first.');
    } catch {
      setError('Enter a valid Muse server address first.');
      return;
    }
    connectionInFlight.current = true;
    setTesting(true);
    try {
      await setConnection(url, token);
      const session = getMuseSession();
      const transport = await getMuseTransport(url);
      if (session !== getMuseSession()) throw new Error('Your care profile or Muse connection changed. Please test again.');
      const result = await testMuseConnection(url, token, transport);
      if (session !== getMuseSession()) throw new Error('Your care profile or Muse connection changed. Please test again.');
      setVerifiedConnection(result.verified ? session : null);
      setMessage(result.verified ? `Live connection verified. ${result.message}` : result.message);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not check Muse.');
    } finally {
      connectionInFlight.current = false;
      setTesting(false);
    }
  }

  async function saveProfile() {
    if (signOutInFlight.current || connectionInFlight.current || profileSaveInFlight.current || !name.trim()) return;
    profileSaveInFlight.current = true;
    setSavingProfile(true);
    setError('');
    setMessage('');
    try {
      await updatePet({ ...data.pet, name: name.trim(), breed: breed.trim(), age: age.trim(), careNeeds: careNeeds.trim() || undefined });
      setMessage('Pet profile saved.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Your pet profile could not be saved. Your details are still here; please try again.');
    } finally {
      profileSaveInFlight.current = false;
      setSavingProfile(false);
    }
  }

  async function clearLocalData() {
    if (signOutInFlight.current || profileSaveInFlight.current || connectionInFlight.current) return;
    signOutInFlight.current = true;
    setResetting(true);
    setError('');
    setMessage('');
    try {
      await reset();
      setConfirmReset(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not reset this pet’s saved local data.');
    } finally { signOutInFlight.current = false; setResetting(false); }
  }

  return <FormPage>
    <AccountMemoryCard mode={facebookConnected ? 'facebook' : 'demo'} accountName={owner?.name || 'Pet parent'} petName={data.pet.name}
      connectionLabel={!data.backendUrl ? 'Preview guide' : verifiedConnection === getMuseSession() ? 'Live verified this session' : 'Server configured · not tested'}
      busy={connectingFacebook} disabled={accountBusy || savingProfile || connectionBusy || !name.trim()} error={accountError}
      onContinueFacebook={() => void connectFacebook()} onViewMemory={() => router.push('/memory')} />
    <FormTitle title="Your account" />
    <View style={styles.accountCard}>
      <View style={styles.accountHeading}>
        <View style={styles.accountIcon}>
          <Icon name={facebookConnected ? 'logo-facebook' : 'person-outline'} color={colors.blue} size={25} />
        </View>
        <View style={styles.accountCopy}>
          <Text style={styles.accountName}>{owner?.name || 'Pet parent'}</Text>
          <Text style={styles.accountStatus}>{facebookConnected ? 'Facebook connected' : 'Demo profile'}</Text>
        </View>
      </View>
      <Text style={styles.accountBody}>{facebookConnected
        ? 'Signing out keeps this account’s pet data on this device. Sign in with the same account on this device to restore it.'
        : 'Leaving the demo keeps its pet data on this device. Choose the demo again to restore it.'}</Text>
      <ActionButton label={signingOut ? (facebookConnected ? 'Signing out…' : 'Leaving demo…') : facebookConnected ? 'Sign out' : 'Leave demo'}
        tone="navy" icon="log-out-outline" disabled={accountBusy || savingProfile} onPress={() => void leaveAccount()} />
      {!!accountError && <FormNote error>{accountError}</FormNote>}
    </View>

    <AppearanceSettings />
    <PetNotificationSettings petName={data.pet.name} sound={notifications.sound} enabled={notifications.enabled} nativeAvailable={notifications.nativeAvailable}
      busy={notifications.busy || accountBusy || savingProfile} message={notifications.message} error={notifications.error}
      onSelectSound={sound => void notifications.selectSound(sound)} onPreviewSound={() => void notifications.previewSound()}
      onToggleNotifications={() => void notifications.toggleNotifications()} onTestNotification={() => void notifications.testNotification()} />
    <WhatsAppSettings />
    <FormTitle title="Make it their own."
      body="Your pet’s details stay on this device until you send them to Muse. Changing the profile starts a fresh Muse conversation." />
    <Field label="Pet name" value={name} onChange={value => { if (!profileSaveInFlight.current && !signOutInFlight.current) setName(value); }} maxLength={50} />
    <Field label="Breed" value={breed} onChange={value => { if (!profileSaveInFlight.current && !signOutInFlight.current) setBreed(value); }} maxLength={80} />
    <Field label="Age" value={age} onChange={value => { if (!profileSaveInFlight.current && !signOutInFlight.current) setAge(value); }} maxLength={40} />
    <Field label="Care needs and preferences" value={careNeeds} onChange={value => { if (!profileSaveInFlight.current && !signOutInFlight.current) setCareNeeds(value); }} multiline maxLength={500} placeholder="Food sensitivities, mobility needs, training goals or things they enjoy" />
    <FormNote>Optional. Muse uses these notes, your pet’s age and breed, and your selected care goals when you ask for guidance. These notes stay out of social post drafting and Marketplace search links. Follow your vet’s care plan for health conditions.</FormNote>
    <ActionButton label={savingProfile ? 'Saving pet profile…' : 'Save pet profile'} disabled={savingProfile || connectionBusy || accountBusy || !name.trim()} icon="paw-outline"
      onPress={() => void saveProfile()} />

    <FormTitle title="Their very own Muse" body="Take or choose a pet photo, then create a custom Muse avatar that carries their own colours and features." />
    <ActionButton label={data.pet.avatar ? 'Update Muse avatar' : 'Create Muse avatar'} tone="violet" icon="camera-outline" disabled={accountBusy || savingProfile} onPress={() => router.push('/avatar')} />

    <View style={styles.divider} />
    <FormTitle title="Muse connection"
      body="Leave the address empty to use the local preview guide. Live Muse requires your own configured server. Changing the address starts a fresh conversation." />
    <Field label="Muse server address" value={url} onChange={value => { if (!connectionInFlight.current && !signOutInFlight.current) setUrl(value); }} placeholder="http://your-computer-address:8787" maxLength={300} />
    <Field label="Connection token (if required)" value={token} onChange={value => { if (!connectionInFlight.current && !signOutInFlight.current) setToken(value); }} secure placeholder="Kept in memory for this app session" maxLength={300} />
    <FormNote>The Meta model API key belongs on the server, never in this app. A connection token is separate. For a phone, use a reachable server address rather than the phone’s localhost.</FormNote>
    <ActionButton label={savingConnection ? 'Activating connection…' : 'Save Muse connection'} tone="violet" onPress={() => void saveConnection()} icon="link-outline" disabled={connectionBusy || accountBusy || savingProfile} />
    <FormNote>Test activates these connection settings for this app session, then sends a brief provider check to Meta without your pet records. The connection token stays in memory and is not saved on this device.</FormNote>
    <ActionButton label={testing ? 'Checking Meta…' : 'Test Meta connection'} disabled={connectionBusy || accountBusy || savingProfile || !url.trim()}
      onPress={() => void testConnection()} icon="pulse-outline" />
    <ActionButton label="Open Muse" tone="navy" disabled={connectionBusy || accountBusy || savingProfile} onPress={() => { if (!connectionInFlight.current && !signOutInFlight.current && !profileSaveInFlight.current) router.push('/muse'); }} icon="chatbubble-ellipses-outline" />
    {!!message && <FormNote>{message}</FormNote>}
    {!!error && <FormNote error>{error}</FormNote>}

    <View style={styles.divider} />
    <FormTitle title="This pet’s saved local data"
      body="Reset clears this pet’s profile, care entries, appointments, Muse conversation, saved slideshow photos and demo reward activity on this device, then returns you to pet setup. Original photo-library files and downloaded videos are managed separately." />
    {confirmReset ? <>
      <FormNote error>Clear this pet’s saved local data? This cannot be undone.</FormNote>
      <ActionButton label={resetting ? 'Clearing saved data…' : 'Clear saved local data'} tone="navy" onPress={() => void clearLocalData()} disabled={accountBusy || savingProfile || connectionBusy} />
      <ActionButton label="Keep my data" onPress={() => setConfirmReset(false)} disabled={accountBusy || savingProfile || connectionBusy} />
    </> : <ActionButton label="Reset this pet’s data…" tone="navy" onPress={() => setConfirmReset(true)} disabled={accountBusy || savingProfile || connectionBusy} />}
    <Text style={styles.footer}>Independent project concept. Collar audio, sensor monitoring, social publishing, real products and payments are not connected in this preview.</Text>
  </FormPage>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  accountCard: { gap: 18, padding: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 22 },
  accountHeading: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  accountIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blueWash },
  accountCopy: { flex: 1, gap: 5 },
  accountName: { color: colors.navy, fontSize: 20, lineHeight: 26, fontWeight: '800' },
  accountStatus: { color: colors.blue, fontSize: 12, fontWeight: '700' },
  accountBody: { color: colors.slate, fontSize: 13, lineHeight: 21 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 8 },
  footer: { color: colors.slate, fontSize: 11, lineHeight: 17 },
});

