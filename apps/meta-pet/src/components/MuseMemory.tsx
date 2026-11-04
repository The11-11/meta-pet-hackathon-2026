import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { AUTH_BASE_URL } from '../auth-client';
import { useAuth } from '../AuthContext';
import { parseMusePageMemory, validMemoryPageId, type MusePageMemory } from '../museMemoryData';
import { useTheme } from '../ThemeContext';
import type { ThemeColors } from '../theme';
import type { MuseTransport } from '../types';
import { FormNote, FormTitle } from './forms';
import { ActionButton, Badge, Icon } from './ui';

type Props = { ownerScope: string; petId: string; petName: string };
type Phase = 'loading' | 'ready' | 'clearing';
const emptyMemory: MusePageMemory = { available: true, exists: false, updatedAt: null, markdown: '' };


async function readRemoteMemory(petId: string, ownerId: string, getTransport: (destination: string) => Promise<MuseTransport>, signal: AbortSignal, current: () => boolean): Promise<MusePageMemory | null> {
  const transport = await getTransport(AUTH_BASE_URL);
  if (!current()) return null;
  if (transport.headers?.['X-Muse-Owner'] !== ownerId) throw new Error('Verify your Facebook sign-in to read private page memory.');
  const response = await fetch(AUTH_BASE_URL + '/api/muse/memory?petId=' + encodeURIComponent(petId), { credentials: transport.credentials, headers: transport.headers, signal });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Your Facebook sign-in could not be verified. Sign in again, then retry.' : 'Saved page memory could not load. Check the server connection and retry.');
  const parsed = parseMusePageMemory(await response.json());
  if (!parsed) throw new Error('The server returned an unsupported memory response. Nothing was displayed.');
  return parsed;
}

export function MuseMemory({ ownerScope, petId, petName }: Props) {
  const { owner, getMuseTransport } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const facebookOwnerId = owner?.mode === 'facebook' ? owner.id : null;
  const [phase, setPhase] = useState<Phase>(facebookOwnerId && validMemoryPageId(petId) ? 'loading' : 'ready');
  const [memory, setMemory] = useState<MusePageMemory | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(facebookOwnerId && !validMemoryPageId(petId) ? 'This pet page could not be identified. Reopen the pet profile and try again.' : '');
  const active = useRef(true);
  const revision = useRef(0);
  const busy = useRef(false);
  const abortRequest = useRef<AbortController | null>(null);
  const latestScope = useRef(ownerScope);

  useEffect(() => {
    latestScope.current = ownerScope;
    active.current = true;
    return () => { active.current = false; revision.current += 1; abortRequest.current?.abort(); abortRequest.current = null; busy.current = false; };
  }, [ownerScope]);

  const load = useCallback(() => {
    if (busy.current || !facebookOwnerId || !validMemoryPageId(petId)) return;
    busy.current = true;
    const scope = ownerScope;
    const request = ++revision.current;
    const current = () => active.current && revision.current === request && latestScope.current === scope;
    const abort = new AbortController();
    abortRequest.current = abort;
    const timer = setTimeout(() => abort.abort(), 10000);
    void readRemoteMemory(petId, facebookOwnerId, getMuseTransport, abort.signal, current).then(parsed => {
      if (current() && parsed) { setMemory(parsed); setReadFailed(false); setError(''); }
    }).catch(failure => {
      if (current()) { setReadFailed(true); setError(failure instanceof Error && failure.name !== 'AbortError' ? failure.message : 'The memory request timed out. Check the connection and retry.'); }
    }).finally(() => {
      clearTimeout(timer);
      if (current()) { busy.current = false; abortRequest.current = null; setPhase('ready'); }
    });
  }, [facebookOwnerId, getMuseTransport, ownerScope, petId]);

  useEffect(() => { void load(); }, [load]);

  function refreshMemory() {
    if (busy.current) return;
    if (!validMemoryPageId(petId)) { setError('This pet page could not be identified. Reopen the pet profile and try again.'); return; }
    setPhase('loading'); setError(''); setMessage(''); setConfirmClear(false); setMemory(null); setReadFailed(false);
    void load();
  }

  async function clearMemory() {
    if (busy.current || !confirmClear || (!memory?.exists && !readFailed) || !facebookOwnerId || !validMemoryPageId(petId)) return;
    busy.current = true;
    const scope = ownerScope;
    const request = ++revision.current;
    const current = () => active.current && revision.current === request && latestScope.current === scope;
    const abort = new AbortController();
    abortRequest.current = abort;
    const timer = setTimeout(() => abort.abort(), 10000);
    setPhase('clearing'); setError(''); setMessage('');
    try {
      const transport = await getMuseTransport(AUTH_BASE_URL);
      if (!current()) return;
      if (transport.headers?.['X-Muse-Owner'] !== facebookOwnerId) throw new Error('Verify your Facebook sign-in before clearing page memory.');
      const response = await fetch(AUTH_BASE_URL + '/api/muse/memory/clear', { method: 'POST', credentials: transport.credentials, headers: { ...transport.headers, 'Content-Type': 'application/json' }, signal: abort.signal, body: JSON.stringify({ petId }) });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Your Facebook sign-in could not be verified. Saved memory was not cleared here.' : 'The server did not confirm clearing. Retry, or refresh to check the saved memory.');
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || (result as Record<string, unknown>).cleared !== true) throw new Error('The server did not confirm clearing. Retry, or refresh to check the saved memory.');
      if (current()) { setMemory(emptyMemory); setReadFailed(false); setConfirmClear(false); setMessage('Saved page memory was cleared for ' + petName + '.'); }
    } catch (failure) {
      if (current()) setError(failure instanceof Error && failure.name !== 'AbortError' ? failure.message : 'Clearing was not confirmed before the connection timed out. Retry or refresh to check the server.');
    } finally {
      clearTimeout(timer);
      if (current()) { busy.current = false; abortRequest.current = null; setPhase('ready'); }
    }
  }

  return <>
    <FormTitle title="Muse page memory" body={'Review what Muse keeps between care sessions for ' + petName + '.'} />
    <View style={styles.card}>
      <View style={styles.heading}><Icon name="document-text-outline" color={colors.violet} /><Text accessibilityRole="header" style={styles.title}>Private to this pet page</Text><Badge text="memory.md" tone="violet" /></View>
      <Text style={styles.body}>For verified Facebook sign-ins, care chats on this server can keep useful questions, preferences and care context in a private memory.md file for your account and this pet page.</Text>
      <Text style={styles.fine}>This is separate from chat history saved on your device. Social post drafts and guest demo or token-only chats do not read or create this server memory.</Text>
    </View>
    {!facebookOwnerId ? <FormNote>Server page memory needs a verified Facebook sign-in. Your guest demo conversation stays saved on this device; it does not create a server memory.md file.</FormNote> : <>
      {phase === 'loading' ? <View style={styles.loading}><ActivityIndicator color={colors.violet} /><Text style={styles.body}>Loading this page’s memory…</Text></View> : null}
      {memory ? <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>{memory.exists ? 'Saved memory' : 'No saved page memory yet'}</Text>
        {memory.updatedAt ? <Text style={styles.fine}>{'Last updated: ' + new Date(memory.updatedAt).toLocaleString()}</Text> : null}
        {memory.exists ? <Text selectable style={styles.markdown}>{memory.markdown || 'The memory file is empty.'}</Text> : <Text style={styles.body}>A future signed-in care chat can create memory for this page. No file contents are available yet.</Text>}
      </View> : null}
      {memory?.exists || readFailed ? confirmClear ? <View style={[styles.card, styles.confirm]}>
        <Text accessibilityRole="header" style={styles.title}>{memory ? 'Clear saved memory for this pet?' : 'Reset memory for this pet page?'}</Text>
        <Text style={styles.body}>{memory ? 'This removes the server page memory shown above.' : 'The current contents could not be loaded. This resets this pet page’s saved server memory, if present.'} Your device’s chat history is separate. Future signed-in care chats can create new memory.</Text>
        <ActionButton label={phase === 'clearing' ? 'Clearing memory…' : memory ? 'Yes, clear this page’s memory' : 'Yes, reset this page’s memory'} icon="trash-outline" disabled={phase !== 'ready'} onPress={() => void clearMemory()} />
        <ActionButton label="Keep saved memory" tone="navy" disabled={phase !== 'ready'} onPress={() => { setConfirmClear(false); setError(''); }} />
      </View> : <ActionButton label={memory ? 'Clear saved page memory' : 'Reset this page’s memory'} tone="navy" icon="trash-outline" disabled={phase !== 'ready'} onPress={() => { setConfirmClear(true); setError(''); setMessage(''); }} /> : null}
      <ActionButton label="Refresh page memory" icon="refresh-outline" tone="violet" disabled={phase !== 'ready'} onPress={refreshMemory} />
    </>}
    {!!message && <FormNote>{message}</FormNote>}
    {!!error && <FormNote error>{error}</FormNote>}
    <ActionButton label="Back to Muse Pet" icon="sparkles-outline" onPress={() => router.replace('/muse')} />
  </>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { padding: 18, gap: 13, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  heading: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' }, title: { color: colors.navy, fontSize: 17, lineHeight: 24, fontWeight: '700' },
  body: { color: colors.slate, fontSize: 13, lineHeight: 21 }, fine: { color: colors.slate, fontSize: 11, lineHeight: 18 }, loading: { flexDirection: 'row', gap: 11, alignItems: 'center', paddingVertical: 12 },
  markdown: { color: colors.navy, fontSize: 13, lineHeight: 22, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }, confirm: { backgroundColor: colors.goldWash, borderColor: colors.gold },
});
