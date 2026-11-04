import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { clearDemoProfileHandoff, loadDemoProfileHandoff, persistDemoProfileHandoff, stageDemoProfileHandoff, type DemoProfileHandoff } from './demoProfileHandoff';
import { AUTH_BASE_URL } from './auth-client';
import { completeOwnerSetup, freshOwnerData, ownerStorageKey, restoreCareNeeds } from './ownerData';
import { parsePetAvatar } from './petAvatarData';
import { persistPetProfile, queueCareWrite } from './carePersistence';
import { petNotificationPreferences } from './notificationData';
import { restoreSocialState, saveSocialProfileData, updateSocialPostData } from './socialData';
import { clearSlideshowDraft, slideshowStorageKey } from './slideshowData';
import { careLabels } from './theme';
import type { AppData, CareKind, PetProfile, Product, ChatMessage, MuseConversation, PetNotificationPreferences, SocialProfile } from './types';
import { appendMuseMessage, approveConversationAction, dismissConversationAction, restoreMuseConversation } from './museConversation';

const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
type Store = {
  data: AppData; ready: boolean; storageError: string; clientToken: string;
  onboardingComplete: boolean;
  profileHandoff: DemoProfileHandoff | null;
  prepareFacebookProfile: () => Promise<string>;
  refreshProfileHandoff: () => Promise<boolean>;
  keepDemoProfile: () => Promise<void>;
  dismissProfileHandoff: () => Promise<void>;
  completeOnboarding: (pet: PetProfile, goals: CareKind[]) => Promise<void>;
  addLog: (kind: CareKind, label: string, note: string) => void;
  addAppointment: (title: string, date: string, note: string) => void;
  savedMuse: MuseConversation | undefined;
  getMuseSession: () => number;
  addMuseMessage: (message: ChatMessage, session: number) => Promise<void>;
  approveMuseAction: (actionId: string) => Promise<void>;
  dismissMuseAction: (actionId: string) => Promise<void>;
  updatePet: (pet: PetProfile) => Promise<void>;
  setConnection: (url: string, token: string) => Promise<void>;
  setNotifications: (preferences: PetNotificationPreferences) => Promise<void>;
  saveSocialProfile: (input: Omit<SocialProfile, 'id' | 'createdAt'>, profileId?: string) => Promise<void>;
  updateSocialPost: (id: string, caption: string) => Promise<void>;
  redeem: (product: Product) => boolean;
  reset: () => Promise<void>;
};
const Context = createContext<Store | null>(null);

export function CareProvider({ children }: { children: React.ReactNode }) {
  const { owner, getMuseTransport } = useAuth();
  const storageKey = ownerStorageKey(owner);
  const ownerMode = owner?.mode ?? null;
  const facebookOwnerId = owner?.mode === 'facebook' ? owner.id : null;
  const [data, setData] = useState<AppData>(() => freshOwnerData(null));
  const current = useRef(data);
  const [loadedScope, setLoadedScope] = useState<string | null>();
  const activeScope = useRef<string | null>(null);
  const ready = loadedScope === storageKey;
  const [completedScope, setCompletedScope] = useState<string | null>(null);
  const onboardingComplete = Boolean(storageKey && completedScope === storageKey);
  const [loadError, setLoadError] = useState('');
  const [writeError, setWriteError] = useState('');
  const storageError = writeError || loadError;
  const [clientToken, setClientToken] = useState('');
  const [savedMuse, setSavedMuse] = useState<MuseConversation>();
  const museSession = useRef(0);
  const writes = useRef(Promise.resolve());
  const [handoffState, setHandoffState] = useState<{ scope: string; value: DemoProfileHandoff } | null>(null);
  const profileHandoff = handoffState?.scope === storageKey ? handoffState.value : null;
  const handoffInFlight = useRef(false);
  const resetInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    activeScope.current = storageKey;
    museSession.current += 1;
    const fresh = freshOwnerData(ownerMode ? { mode: ownerMode } : null, AUTH_BASE_URL);
    void (async () => {
      // A quick sign-out and return must include the prior account's last save.
      await writes.current.catch(() => {});
      if (!active) return;
      // Read the external store before publishing one complete account snapshot.
      const raw = storageKey ? await AsyncStorage.getItem(storageKey) : await Promise.resolve(null);
      if (!active) return;
      let restored = fresh;
      if (raw) {
        const saved = JSON.parse(raw) as AppData;
      if (!saved.pet || typeof saved.pet.name !== 'string' || !Array.isArray(saved.logs) || !Array.isArray(saved.appointments) || !Array.isArray(saved.rewards) ||
        saved.logs.some(log => !Object.hasOwn(careLabels, log.type) || typeof log.label !== 'string' || Number.isNaN(Date.parse(log.recordedAt))) ||
        saved.rewards.some(entry => !Number.isFinite(entry.amount) || typeof entry.label !== 'string') || typeof saved.backendUrl !== 'string') {
        throw new Error('Invalid saved data');
      }
        const restoredPet = { ...saved.pet, careNeeds: restoreCareNeeds(saved.pet.careNeeds), avatar: parsePetAvatar(saved.pet.avatar) };
        restored = { ...saved, pet: restoredPet, social: restoreSocialState(saved.social), notifications: petNotificationPreferences(saved.notifications, saved.pet.species) };
        restored.muse = restoreMuseConversation(saved.muse, restored);
      }
      let handoff: DemoProfileHandoff | null = null;
      let handoffLoadFailed = false;
      if (ownerMode === 'facebook' && owner?.id) {
        try { handoff = await loadDemoProfileHandoff(AsyncStorage, owner.id); } catch { handoffLoadFailed = true; }
      }
      if (!active) return;
      setHandoffState(handoff && storageKey ? { scope: storageKey, value: handoff } : null);
      current.current = restored;
      setSavedMuse(restored.muse);
      setCompletedScope(restored.onboarding?.completed && restored.pet.name.trim() ? storageKey : null);
      setClientToken(''); setLoadError(handoffLoadFailed ? 'Your pet is loaded, but the demo profile choice could not be checked. Reopen the app to retry.' : ''); setWriteError('');
      setData(restored);
    })().catch(() => { if (active) { current.current = fresh; setData(fresh); setSavedMuse(undefined); setCompletedScope(null); setClientToken(''); setLoadError('Saved care data could not be loaded. Please set up your pet again.'); } })
      .finally(() => { if (active) setLoadedScope(storageKey); });
    return () => { active = false; };
  }, [storageKey, ownerMode, owner?.id]);


  const prepareFacebookProfile = useCallback(async () => {
    if (owner?.mode !== 'demo' || !storageKey || activeScope.current !== storageKey || loadedScope !== storageKey) throw new Error('Reopen the demo profile before connecting Facebook.');
    await writes.current.catch(() => {});
    if (activeScope.current !== storageKey) throw new Error('Your care account changed. Try again.');
    return await stageDemoProfileHandoff(AsyncStorage, current.current);
  }, [owner?.mode, storageKey, loadedScope]);
  const refreshProfileHandoff = useCallback(async () => {
    if (!facebookOwnerId || !storageKey || activeScope.current !== storageKey) return false;
    const handoff = await loadDemoProfileHandoff(AsyncStorage, facebookOwnerId);
    if (activeScope.current !== storageKey) throw new Error('Your care account changed. Reopen the current profile.');
    setHandoffState(handoff ? { scope: storageKey, value: handoff } : null);
    return Boolean(handoff);
  }, [facebookOwnerId, storageKey]);
  const keepDemoProfile = useCallback(async () => {
    if (handoffInFlight.current) return;
    if (owner?.mode !== 'facebook' || !storageKey || !profileHandoff || activeScope.current !== storageKey || loadedScope !== storageKey) throw new Error('Review this profile again after signing in.');
    handoffInFlight.current = true;
    const ownerId = owner.id, invitationId = profileHandoff.id;
    try {
      const transport = await getMuseTransport(AUTH_BASE_URL);
      if (transport.headers?.['X-Muse-Owner'] !== ownerId || activeScope.current !== storageKey) throw new Error('Verify the same Facebook account before keeping this profile.');
      const save = queueCareWrite(writes.current, async () => {
        if (activeScope.current !== storageKey) throw new Error('Your care account changed. No profile was copied.');
        const target = current.current;
        const next = await persistDemoProfileHandoff(AsyncStorage, storageKey, target, invitationId, ownerId,
          () => activeScope.current === storageKey && current.current === target);
        current.current = next; setData(next); setSavedMuse(undefined); setCompletedScope(storageKey); setWriteError(''); museSession.current += 1;
        await clearDemoProfileHandoff(AsyncStorage, invitationId, ownerId);
        if (activeScope.current === storageKey) setHandoffState(previous => previous?.scope === storageKey && previous.value.id === invitationId ? null : previous);
      });
      writes.current = save.catch(() => {});
      await save;
    } finally { handoffInFlight.current = false; }
  }, [owner?.id, owner?.mode, storageKey, loadedScope, profileHandoff, getMuseTransport]);
  const dismissProfileHandoff = useCallback(async () => {
    if (handoffInFlight.current) return;
    if (owner?.mode !== 'facebook' || !storageKey || !profileHandoff || activeScope.current !== storageKey) throw new Error('Your care account changed. Reopen this choice.');
    handoffInFlight.current = true;
    try {
      const transport = await getMuseTransport(AUTH_BASE_URL);
      if (transport.headers?.['X-Muse-Owner'] !== owner.id || activeScope.current !== storageKey) throw new Error('Verify the same Facebook account before continuing.');
      await clearDemoProfileHandoff(AsyncStorage, profileHandoff.id, owner.id);
      if (activeScope.current === storageKey) setHandoffState(previous => previous?.scope === storageKey && previous.value.id === profileHandoff.id ? null : previous);
    } finally { handoffInFlight.current = false; }
  }, [owner?.id, owner?.mode, storageKey, profileHandoff, getMuseTransport]);

  const commit = useCallback((next: AppData) => {
    if (!storageKey || activeScope.current !== storageKey || loadedScope !== storageKey) throw new Error('Your care profile changed. Please try again.');
    current.current = next;
    setData(next);
    const save = queueCareWrite(writes.current, async () => {
      await AsyncStorage.setItem(storageKey, JSON.stringify(next));
      if (activeScope.current === storageKey) {
        setSavedMuse(next.muse);
        setCompletedScope(next.onboarding?.completed ? storageKey : null);
        setWriteError('');
      }
    });
    writes.current = save.catch(() => { if (activeScope.current === storageKey) setWriteError('Changes are visible, but could not be saved on this device.'); });
    return save;
  }, [storageKey, loadedScope]);
  const completeOnboarding = useCallback(async (pet: PetProfile, goals: CareKind[]) => {
    museSession.current += 1;
    await commit(completeOwnerSetup(current.current, pet, goals));
  }, [commit]);
  const setNotifications = useCallback(async (preferences: PetNotificationPreferences) => {
    await commit({ ...current.current, notifications: petNotificationPreferences(preferences, current.current.pet.species) });
  }, [commit]);
  const saveSocialProfile = useCallback(async (input: Omit<SocialProfile, 'id' | 'createdAt'>, profileId?: string) => {
    const next = saveSocialProfileData(current.current, input, profileId);
    museSession.current += 1;
    await commit(next);
  }, [commit]);
  const updateSocialPost = useCallback(async (postId: string, caption: string) => {
    await commit(updateSocialPostData(current.current, postId, caption));
  }, [commit]);
  const addLog = useCallback((kind: CareKind, label: string, note: string) => {
    const log = { id: id(), type: kind, label: label.trim() || careLabels[kind], note: note.trim(), recordedAt: new Date().toISOString() };
    commit({ ...current.current, logs: [log, ...current.current.logs] });
  }, [commit]);
  const addAppointment = useCallback((title: string, date: string, note: string) => {
    commit({ ...current.current, appointments: [...current.current.appointments, { id: id(), title, date, note }].sort((a, b) => a.date.localeCompare(b.date)) });
  }, [commit]);
  const updatePet = useCallback(async (pet: PetProfile) => {
    if (pet.careNeeds !== undefined && (typeof pet.careNeeds !== 'string' || pet.careNeeds.length > 500)) throw new Error('Care needs must contain at most 500 characters.');
    pet = { ...pet, careNeeds: restoreCareNeeds(pet.careNeeds) };
    if (!storageKey || activeScope.current !== storageKey || loadedScope !== storageKey) throw new Error('Your care profile changed. Please try again.');
    let session = museSession.current;
    await persistPetProfile(current.current, pet, commit, () => { session = ++museSession.current; });
    if (activeScope.current !== storageKey || museSession.current !== session) throw new Error('Your care profile changed while saving. Reopen the current profile before continuing.');
  }, [commit, loadedScope, storageKey]);
  const getMuseSession = useCallback(() => museSession.current, []);
  const addMuseMessage = useCallback(async (message: ChatMessage, session: number) => {
    if (session !== museSession.current) throw new Error('Your pet profile or Muse connection changed. Please send your message again.');
    await commit(appendMuseMessage(current.current, message));
  }, [commit]);
  const approveMuseAction = useCallback(async (actionId: string) => {
    // Update synchronously so subsequent manual edits include this action, then
    // wait for its ordered device write before reporting success. A failed save
    // remains retryable: the same record ID prevents duplicates on retry.
    await commit(approveConversationAction(current.current, actionId));
  }, [commit]);
  const dismissMuseAction = useCallback(async (actionId: string) => {
    await commit(dismissConversationAction(current.current, actionId));
  }, [commit]);
  const setConnection = useCallback(async (url: string, token: string) => {
    if (!storageKey || activeScope.current !== storageKey || loadedScope !== storageKey) throw new Error('Your care profile changed. Please save the connection again.');
    const backendUrl = url.trim().replace(/\/+$/, '');
    const session = ++museSession.current;
    // Clear the prior credential before changing its destination. Tokens stay
    // in memory and are activated only after the ordered device save succeeds.
    setClientToken('');
    await commit({ ...current.current, backendUrl, ...(backendUrl !== current.current.backendUrl ? { muse: undefined } : {}) });
    if (activeScope.current !== storageKey || museSession.current !== session || current.current.backendUrl !== backendUrl) throw new Error('Your care profile or Muse connection changed. Please save the connection again.');
    setClientToken(token.trim());
  }, [commit, loadedScope, storageKey]);
  const redeem = useCallback((product: Product) => {
    const balance = current.current.rewards.reduce((sum, entry) => sum + entry.amount, 0);
    if (!Number.isFinite(product.points) || product.points <= 0 || balance < product.points) return false;
    commit({ ...current.current, rewards: [{ id: id(), label: `${product.name} · demo redemption`, amount: -product.points, createdAt: new Date().toISOString() }, ...current.current.rewards] });
    return true;
  }, [commit]);
  const reset = useCallback(async () => {
    if (resetInFlight.current) throw new Error('This pet’s saved data is already being cleared.');
    const petId = current.current.pet.id;
    const slideshowKey = slideshowStorageKey(owner, petId);
    const stillActive = () => Boolean(storageKey && activeScope.current === storageKey && loadedScope === storageKey && current.current.pet.id === petId);
    if (!slideshowKey || !stillActive()) throw new Error('Your care account changed. Reopen the current pet before clearing saved data.');
    resetInFlight.current = true;
    museSession.current += 1;
    try {
      await writes.current.catch(() => {});
      await clearSlideshowDraft(AsyncStorage, slideshowKey, stillActive);
      if (!stillActive()) throw new Error('Your care account changed. Its new profile has not been reset.');
      setLoadError(''); setWriteError(''); setClientToken('');
      await commit(freshOwnerData(ownerMode ? { mode: ownerMode } : null, AUTH_BASE_URL));
    } finally { resetInFlight.current = false; }
  }, [commit, owner, ownerMode, storageKey, loadedScope]);
  return <Context.Provider value={{ data, ready, storageError, clientToken, onboardingComplete, profileHandoff, prepareFacebookProfile, refreshProfileHandoff, keepDemoProfile, dismissProfileHandoff, completeOnboarding, savedMuse, getMuseSession, addMuseMessage, addLog, addAppointment, approveMuseAction, dismissMuseAction, updatePet, setConnection, setNotifications, saveSocialProfile, updateSocialPost, redeem, reset }}>{children}</Context.Provider>;
}

export function useCare() {
  const value = useContext(Context);
  if (!value) throw new Error('CareProvider is required');
  return value;
}
