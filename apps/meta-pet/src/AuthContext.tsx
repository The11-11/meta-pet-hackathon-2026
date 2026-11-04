import AsyncStorage from '@react-native-async-storage/async-storage';
import { PUBLIC_DEMO_ONLY } from './demoMode';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { AUTH_BASE_URL, authClient } from './auth-client';
import { completeFacebookLogin } from './completeFacebookLogin';
import { DEMO_OWNER, parseOwner, type Owner } from './ownerData';
import { isAuthDestination } from './authDestination';
import type { MuseTransport } from './types';

const DEMO_KEY = 'muse.pet.demo-selected.v1';
type FacebookConfig = { available: boolean; message: string };
type AuthStore = {
  owner: Owner | null; ready: boolean; config: FacebookConfig;
  startDemo: () => Promise<void>; loginWithFacebook: (profileHandoffId?: string) => Promise<void>;
  connectFacebookLocation: (source: 'profile' | 'pages') => Promise<void>;
  connectFacebookPhotos: () => Promise<void>;
  refreshSession: () => Promise<Owner | null>; signOut: () => Promise<void>;
  getMuseTransport: (destination: string) => Promise<MuseTransport>;
};
const Context = createContext<AuthStore | null>(null);
type VerifiedSession = { owner: Owner | null; identity: string | null };
type AuthSnapshot = VerifiedSession & { ready: boolean };

function sessionIdentity(user: unknown, session: unknown): string | null {
  const owner = parseOwner(user);
  const sessionId = session && typeof session === 'object' ? (session as Record<string, unknown>).id : null;
  return owner && typeof sessionId === 'string' && sessionId.trim() ? JSON.stringify([owner.id, sessionId]) : null;
}

async function facebookConfig(): Promise<FacebookConfig> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${AUTH_BASE_URL}/api/auth/config`, { signal: controller.signal, credentials: 'omit' });
    const result = await response.json();
    return { available: response.ok && result.provider === 'facebook' && result.available === true, message: 'Facebook sign-in is not connected in this preview yet. You can explore the demo flow.' };
  } catch { return { available: false, message: 'Facebook sign-in is not connected in this preview yet. You can explore the demo flow.' }; }
  finally { clearTimeout(timeout); }
}

async function verifiedSession(): Promise<VerifiedSession> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const result = await authClient.getSession({ query: { disableCookieCache: true }, fetchOptions: { signal: controller.signal } });
    if (result.error) throw new Error('We could not verify your Facebook sign-in. Please try again.');
    const identity = sessionIdentity(result.data?.user, result.data?.session);
    return { owner: identity ? parseOwner(result.data?.user) : null, identity };
  } finally { clearTimeout(timeout); }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return PUBLIC_DEMO_ONLY ? <PublicDemoAuthProvider>{children}</PublicDemoAuthProvider> : <ConnectedAuthProvider>{children}</ConnectedAuthProvider>;
}

function PublicDemoAuthProvider({ children }: { children: ReactNode }) {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(DEMO_KEY).then(value => { if (active) setOwner(value === 'yes' ? DEMO_OWNER : null); })
      .catch(() => {}).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  const startDemo = useCallback(async () => { await AsyncStorage.setItem(DEMO_KEY, 'yes'); setOwner(DEMO_OWNER); }, []);
  const signOut = useCallback(async () => { await AsyncStorage.removeItem(DEMO_KEY); setOwner(null); }, []);
  const unavailable = useCallback(async () => { throw new Error('This is the guided demo. Facebook sign-in and account memory are being connected separately.'); }, []);
  const refreshSession = useCallback(async () => null, []);
  const getMuseTransport = useCallback(async (): Promise<MuseTransport> => ({ credentials: 'omit' }), []);
  return <Context.Provider value={{ owner, ready, config: { available: false, message: 'Guided demo · saved in this browser' },
    startDemo, signOut, loginWithFacebook: unavailable, connectFacebookLocation: unavailable, connectFacebookPhotos: unavailable, refreshSession, getMuseTransport }}>{children}</Context.Provider>;
}

function ConnectedAuthProvider({ children }: { children: ReactNode }) {
  // Mounting the library's session atom enables its cross-tab and focus refresh
  // manager. Its native cache is only an invalidation signal, never owner proof.
  const observedSession = authClient.useSession();
  const observedIdentity = sessionIdentity(observedSession.data?.user, observedSession.data?.session);
  const observed = useRef({ identity: observedIdentity, refetch: observedSession.refetch });
  useEffect(() => { observed.current = { identity: observedIdentity, refetch: observedSession.refetch }; }, [observedIdentity, observedSession.refetch]);
  const [snapshot, setSnapshot] = useState<AuthSnapshot>({ owner: null, identity: null, ready: false });
  const current = useRef(snapshot);
  const operation = useRef(0);
  const nativeLogin = useRef<Promise<Owner | null> | null>(null);
  const publish = useCallback((next: AuthSnapshot) => { current.current = next; setSnapshot(next); }, []);
  const [config, setConfig] = useState<FacebookConfig>({ available: false, message: 'Checking Facebook sign-in…' });

  const verifyAndPublish = useCallback(async (revision = ++operation.current, profileHandoffId?: string) => {
    const selected = await completeFacebookLogin(AsyncStorage, verifiedSession, () => revision === operation.current, profileHandoffId);
    if (revision !== operation.current) throw new Error('Your sign-in changed. Please try again.');
    if (selected.owner) await AsyncStorage.removeItem(DEMO_KEY);
    if (revision !== operation.current) throw new Error('Your sign-in changed. Please try again.');
    publish({ ...selected, ready: true });
    if (observed.current.identity !== selected.identity) void observed.current.refetch().catch(() => {});
    return selected.owner;
  }, [publish]);

  useEffect(() => {
    let active = true;
    const revision = ++operation.current;
    void facebookConfig().then(value => { if (active) setConfig(value); });
    void (async () => {
      try {
        const demo = await AsyncStorage.getItem(DEMO_KEY);
        const selected = demo === 'yes' ? { owner: DEMO_OWNER, identity: null } : await verifiedSession();
        if (active && revision === operation.current) publish({ ...selected, ready: true });
      } catch { if (active && revision === operation.current) publish({ owner: null, identity: null, ready: true }); }
    })();
    return () => { active = false; };
  }, [publish]);

  useEffect(() => {
    if (!snapshot.ready || snapshot.owner?.mode === 'demo' || observedSession.isPending || observedSession.isRefetching || nativeLogin.current || snapshot.identity === observedIdentity) return;
    const revision = ++operation.current;
    void verifyAndPublish(revision).catch(() => {
      if (revision === operation.current) publish({ owner: null, identity: null, ready: true });
    });
  }, [snapshot.ready, snapshot.owner?.mode, snapshot.identity, observedIdentity, observedSession.isPending, observedSession.isRefetching, verifyAndPublish, publish]);

  // A settled session change hides the previous owner's profile before the
  // asynchronous re-verification can publish the next account snapshot.
  const identityChanged = snapshot.owner?.mode === 'facebook' && !observedSession.isPending && !observedSession.isRefetching && snapshot.identity !== observedIdentity;
  const owner = identityChanged ? null : snapshot.owner;
  const ready = snapshot.ready && !identityChanged;

  const startDemo = useCallback(async () => {
    const revision = ++operation.current;
    await AsyncStorage.setItem(DEMO_KEY, 'yes');
    if (revision !== operation.current) throw new Error('Your sign-in changed. Please try again.');
    publish({ owner: DEMO_OWNER, identity: null, ready: true });
  }, [publish]);
  const refreshSession = useCallback(async () => {
    // The native browser deep link can mount the callback before the Expo
    // plugin finishes persisting its returned cookie. Reuse that full flow.
    if (nativeLogin.current) return nativeLogin.current;
    return verifyAndPublish();
  }, [verifyAndPublish]);
  const loginWithFacebook = useCallback(async (profileHandoffId?: string) => {
    if (profileHandoffId && !/^handoff-[0-9]+-[a-z0-9]{1,16}$/.test(profileHandoffId)) throw new Error('Reopen Settings before connecting this demo profile.');
    const revision = ++operation.current;
    const available = await facebookConfig();
    if (revision !== operation.current) throw new Error('Your sign-in changed. Please try again.');
    setConfig(available);
    if (!available.available) throw new Error(available.message);
    const callbackBase = Platform.OS === 'web' ? Linking.createURL('/auth/callback') : '/auth/callback';
    const callbackURL = callbackBase + (profileHandoffId ? (callbackBase.includes('?') ? '&' : '?') + 'handoff=' + encodeURIComponent(profileHandoffId) : '');
    const login = (async () => {
      const result = await authClient.signIn.social({ provider: 'facebook', callbackURL, errorCallbackURL: callbackURL });
      if (revision !== operation.current) throw new Error('Your sign-in changed. Please try again.');
      if (result.error) throw new Error('Sign-in was not completed. Please try again or explore the preview.');
      if (Platform.OS === 'web') return null;
      // iOS can finish the auth browser without mounting the callback route.
      // Bind its explicit profile choice before CareProvider reads this owner.
      const selected = await verifyAndPublish(revision, profileHandoffId);
      if (!selected) throw new Error('Sign-in was not completed. Please try again or explore the preview.');
      return selected;
    })();
    if (Platform.OS !== 'web') nativeLogin.current = login;
    try { await login; }
    finally { if (nativeLogin.current === login) nativeLogin.current = null; }
  }, [verifyAndPublish]);
  const signOut = useCallback(async () => {
    const revision = ++operation.current;
    if (current.current.owner?.mode === 'facebook') {
      const result = await authClient.signOut();
      if (result.error) throw new Error('Could not sign out. Please try again.');
    }
    await AsyncStorage.removeItem(DEMO_KEY);
    if (revision === operation.current) publish({ owner: null, identity: null, ready: true });
  }, [publish]);
  const getMuseTransport = useCallback(async (destination: string): Promise<MuseTransport> => {
    // Capture the owner from this render, alongside the caller's care snapshot.
    // Reading only the latest owner here could pair an old pet with a new login.
    const expected = owner;
    if (expected?.mode !== 'facebook' || !isAuthDestination(destination, AUTH_BASE_URL)) return { credentials: 'omit' };
    if (current.current.owner?.mode !== 'facebook' || current.current.owner.id !== expected.id) throw new Error('Your care account changed. Please send your message again.');
    const revision = operation.current;
    const selected = await verifiedSession();
    if (revision !== operation.current || current.current.owner?.mode !== 'facebook' || current.current.owner.id !== expected.id) throw new Error('Your care account changed. Please send your message again.');
    if (selected.owner?.id !== expected.id) {
      publish({ ...selected, ready: true });
      if (observed.current.identity !== selected.identity) void observed.current.refetch().catch(() => {});
      throw new Error('Your Facebook sign-in changed. Please reopen your care profile before sending.');
    }
    const cookie = Platform.OS === 'web' ? '' : await authClient.getCookie();
    if (revision !== operation.current || current.current.owner?.mode !== 'facebook' || current.current.owner.id !== expected.id) throw new Error('Your care account changed. Please send your message again.');
    return { credentials: Platform.OS === 'web' ? 'include' : 'omit', headers: { 'X-Muse-Owner': expected.id, ...(cookie ? { Cookie: cookie } : {}) } };
  }, [owner, publish]);
  const connectFacebookLocation = useCallback(async (source: 'profile' | 'pages') => {
    if (source !== 'profile' && source !== 'pages') throw new Error('Choose Facebook city or Page location.');
    const expected = owner;
    if (expected?.mode !== 'facebook') throw new Error('Sign in with Facebook before sharing a city or Page location.');
    // Reverify this exact owner before requesting optional provider access.
    await getMuseTransport(AUTH_BASE_URL);
    const revision = ++operation.current;
    const callbackURL = Platform.OS === 'web' ? Linking.createURL('/trainers') : '/trainers';
    const scopes = source === 'profile' ? ['user_location'] : ['pages_show_list', 'pages_read_engagement'];
    const linking = (async () => {
      const result = await authClient.linkSocial({ provider: 'facebook', scopes, callbackURL, errorCallbackURL: callbackURL });
      if (revision !== operation.current) throw new Error('Your sign-in changed. Please try again.');
      if (result.error) throw new Error('Facebook did not grant that access. You can enter a general area instead.');
      if (Platform.OS === 'web') return null;
      const selected = await verifyAndPublish(revision);
      if (selected?.mode !== 'facebook' || selected.id !== expected.id) throw new Error('Use the same Facebook account to share your area.');
      return selected;
    })();
    if (Platform.OS !== 'web') nativeLogin.current = linking;
    try { await linking; }
    finally { if (nativeLogin.current === linking) nativeLogin.current = null; }
  }, [owner, getMuseTransport, verifyAndPublish]);
  const connectFacebookPhotos = useCallback(async () => {
    const expected = owner;
    if (expected?.mode !== 'facebook') throw new Error('Sign in with Facebook before choosing tagged photos.');
    await getMuseTransport(AUTH_BASE_URL);
    const revision = ++operation.current;
    const callbackURL = Platform.OS === 'web' ? Linking.createURL('/slideshow') : '/slideshow';
    const linking = (async () => {
      const result = await authClient.linkSocial({ provider: 'facebook', scopes: ['user_photos'], callbackURL, errorCallbackURL: callbackURL });
      if (revision !== operation.current) throw new Error('Your sign-in changed. Please try again.');
      if (result.error) throw new Error('Facebook did not grant photo access. It may require Meta approval for this app. You can still choose photos from your device.');
      if (Platform.OS === 'web') return null;
      const selected = await verifyAndPublish(revision);
      if (selected?.mode !== 'facebook' || selected.id !== expected.id) throw new Error('Use the same Facebook account to choose your tagged photos.');
      return selected;
    })();
    if (Platform.OS !== 'web') nativeLogin.current = linking;
    try { await linking; }
    finally { if (nativeLogin.current === linking) nativeLogin.current = null; }
  }, [owner, getMuseTransport, verifyAndPublish]);
  return <Context.Provider value={{ owner, ready, config, startDemo, loginWithFacebook, connectFacebookLocation, connectFacebookPhotos, refreshSession, signOut, getMuseTransport }}>{children}</Context.Provider>;
}

export function useAuth() {
  const auth = useContext(Context);
  if (!auth) throw new Error('AuthProvider is required');
  return auth;
}
