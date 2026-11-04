import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from './AuthContext';
import { useCare } from './CareContext';
import { petNotificationPreferences, petSoundLabels } from './notificationData';
import { refreshPetReminders, type PetReminderTarget } from './notificationSync';
import * as notifications from './petNotifications';
import type { PetNotificationSound } from './types';

type Controls = { sound: PetNotificationSound; enabled: boolean; nativeAvailable: boolean; busy: boolean; message: string; error: string;
  selectSound: (sound: PetNotificationSound) => Promise<void>; previewSound: () => Promise<void>; toggleNotifications: () => Promise<void>; testNotification: () => Promise<void> };
const Context = createContext<Controls | null>(null);
const subscribeClient = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
const loadingControls: Controls = { sound: 'bark', enabled: false, nativeAvailable: false, busy: true, message: '', error: '',
  selectSound: async () => {}, previewSound: async () => {}, toggleNotifications: async () => {}, testNotification: async () => {} };

export function PetNotificationProvider({ children }: { children: ReactNode }) {
  const client = useSyncExternalStore(subscribeClient, clientSnapshot, serverSnapshot);
  // HTMLAudioElement is unavailable during Expo's web server rendering.
  if (Platform.OS === 'web' && !client) return <Context.Provider value={loadingControls}>{children}</Context.Provider>;
  return <ActivePetNotificationProvider>{children}</ActivePetNotificationProvider>;
}

function ActivePetNotificationProvider({ children }: { children: ReactNode }) {
  const { owner, ready: authReady } = useAuth();
  const { data, ready, onboardingComplete, setNotifications, getMuseSession } = useCare();
  const { enabled, sound } = petNotificationPreferences(data.notifications, data.pet.species);
  const nativeAvailable = Platform.OS !== 'web';
  const bark = useAudioPlayer(require('../assets/sounds/bark.wav'));
  const meow = useAudioPlayer(require('../assets/sounds/meow_v2.wav'));
  const [busy, setBusy] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [foregroundRevision, setForegroundRevision] = useState(0);
  const alertsEnabled = enabled && permissionGranted === true;
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const working = useRef(false);
  const revision = useRef(0);
  const queue = useRef(Promise.resolve());
  const targetKey = JSON.stringify(owner && ready && onboardingComplete ? { owner: `${owner.mode}:${owner.id}`, petId: data.pet.id, petName: data.pet.name, enabled, sound, appointments: data.appointments } : null);

  useEffect(() => {
    if (!nativeAvailable) return;
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', next => {
      const returning = next === 'active' && previous !== 'active';
      previous = next;
      if (returning) setForegroundRevision(value => value + 1);
    });
    return () => subscription.remove();
  }, [nativeAvailable]);

  useEffect(() => {
    if (!nativeAvailable || !authReady || !ready) return;
    let active = true;
    const current = ++revision.current;
    const target = JSON.parse(targetKey) as PetReminderTarget | null;
    queue.current = queue.current.catch(() => {}).then(async () => {
      if (!active || current !== revision.current) return;
      setPermissionGranted(null);
      const refreshed = await refreshPetReminders(target, notifications, () => active && current === revision.current);
      if (active && current === revision.current) {
        setPermissionGranted(refreshed.permission);
        setError(target?.enabled && refreshed.permission === false ? 'Phone notifications are blocked in your phone settings. Allow notifications there, then return here to restore your reminders.' : '');
      }
    }).catch(() => { if (active && current === revision.current) { setPermissionGranted(false); setError('Phone reminders could not be updated. Check notification permission in your phone settings.'); } });
    return () => { active = false; };
  }, [targetKey, nativeAvailable, authReady, ready, foregroundRevision]);

  useEffect(() => {
    const finished = (label: string) => setMessage(previous => {
      if (!previous.startsWith('Test alert:')) return `${label} preview played.`;
      return previous.endsWith(` ${label} played.`) ? previous : `${previous} ${label} played.`;
    });
    const subscriptions = [bark.addListener('playbackStatusUpdate', status => { if (status.error) setError('The bark preview could not play. Check the device volume and try again.'); if (status.didJustFinish) finished('Bark'); }),
      meow.addListener('playbackStatusUpdate', status => { if (status.error) setError('The meow preview could not play. Check the device volume and try again.'); if (status.didJustFinish) finished('Meow'); })];
    return () => { subscriptions.forEach(subscription => subscription.remove()); };
  }, [bark, meow]);

  const perform = async (work: (session: number) => Promise<void>) => {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); setMessage('');
    try { await work(getMuseSession()); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Your notification setting could not be updated.'); }
    finally { working.current = false; setBusy(false); }
  };
  const play = async () => {
    bark.pause(); meow.pause();
    if (sound === 'silent') { setMessage('Quiet keeps your alerts silent.'); return; }
    if (sound === 'default') { setMessage('Default uses your phone’s normal notification tone.'); return; }
    await setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false, playsInSilentMode: false });
    const player = sound === 'bark' ? bark : meow;
    await player.seekTo(0);
    player.play();
    setMessage(`Playing ${petSoundLabels[sound].toLowerCase()}…`);
  };
  const selectSound = (next: PetNotificationSound) => perform(async () => {
    bark.pause(); meow.pause();
    await setNotifications({ enabled, sound: next });
    setMessage(`${petSoundLabels[next]} selected for ${data.pet.name}.`);
  });
  const previewSound = () => perform(play);
  const toggleNotifications = () => perform(async session => {
    if (!nativeAvailable) { setMessage('Phone alerts need the mobile app. You can preview the sounds here.'); return; }
    if (alertsEnabled) { await setNotifications({ enabled: false, sound }); setMessage('Phone alerts turned off.'); return; }
    const granted = await notifications.requestPetNotificationPermission();
    if (session !== getMuseSession()) throw new Error('Your pet profile changed. Please try again.');
    setPermissionGranted(granted);
    if (!granted) throw new Error('Notifications are not allowed yet. You can enable them in your phone settings.');
    await setNotifications({ enabled: true, sound });
    setMessage('Phone alerts enabled. Reminders aim for 15 minutes before upcoming appointments; delivery depends on your phone settings.');
  });
  const testNotification = () => perform(async session => {
    if (!nativeAvailable) { await play(); setMessage(`Test alert: a little care check-in for ${data.pet.name}. This is an in-app preview.`); return; }
    if (!owner || !alertsEnabled) throw new Error('Enable phone alerts before sending a test.');
    await queue.current;
    if (session !== getMuseSession()) throw new Error('Your pet profile changed. Please try again.');
    await notifications.schedulePetTestNotification({ petId: data.pet.id, petName: data.pet.name, sound });
    if (session !== getMuseSession()) { await notifications.cancelPetNotificationsForPet(data.pet.id); return; }
    setMessage('Test alert scheduled to start in about two seconds. Your phone may delay delivery; sound and focus settings still apply.');
  });

  return <Context.Provider value={{ sound, enabled: alertsEnabled, nativeAvailable, busy: busy || (nativeAvailable && permissionGranted === null), message, error, selectSound, previewSound, toggleNotifications, testNotification }}>{children}</Context.Provider>;
}

export function usePetNotifications() {
  const value = useContext(Context);
  if (!value) throw new Error('PetNotificationProvider is required');
  return value;
}
