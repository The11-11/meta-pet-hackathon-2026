import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PetMuseAvatar } from '../components/PetMuseAvatar';
import { MuseJourneyGuide } from '../components/MuseJourneyGuide';
import { MuseActionCard } from '../components/MuseActionCard';
import { ActionButton } from '../components/ui';
import type { MuseAction } from '../museActions';
import { useCare } from '../CareContext';
import { useAuth } from '../AuthContext';
import { isLocalSocialDraftRequest, requestMuse } from '../muse';
import { museHistory } from '../museConversation';
import { isSlideshowRequest } from '../slideshowIntent';
import type { ThemeColors } from '../theme';
import { useTheme } from '../ThemeContext';

export default function MuseScreen({ onOpenCollar, onOpenSettings }: { onOpenCollar: () => void; onOpenSettings: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, clientToken, savedMuse, getMuseSession, addMuseMessage, approveMuseAction, dismissMuseAction } = useCare();
  const { getMuseTransport } = useAuth();
  const messages = data.muse?.petId === data.pet.id ? data.muse.messages : [];
  const decisions = savedMuse?.petId === data.pet.id ? savedMuse.decisions : {};
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [savingActions, setSavingActions] = useState<Record<string, boolean>>({});
  const actionWork = useRef(new Set<string>());
  const sending = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const followChat = useRef(false);
  const busy = pending || Object.values(savingActions).some(Boolean);
  async function decide(action: MuseAction, decision: 'approve' | 'dismiss') {
    if (actionWork.current.has(action.id)) return;
    actionWork.current.add(action.id);
    setError('');
    setSavingActions(previous => ({ ...previous, [action.id]: true }));
    try {
      if (decision === 'approve') {
        await approveMuseAction(action.id);
        if (action.type === 'record_care') {
          followChat.current = false;
          scroll.current?.scrollTo({ y: 0, animated: true });
        }
      }
      else await dismissMuseAction(action.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The entry could not be saved. Please try again.');
    } finally {
      actionWork.current.delete(action.id);
      setSavingActions(previous => ({ ...previous, [action.id]: false }));
    }
  }
  async function send(text = draft) {
    const message = text.trim();
    if (!message || sending.current || actionWork.current.size) return;
    sending.current = true;
    followChat.current = true;
    const session = getMuseSession();
    const history = museHistory(messages, decisions);
    const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setDraft(''); setError(''); setPending(true);
    try {
      await addMuseMessage({ id: `${id()}-user`, role: 'user', content: message }, session);
      if (session !== getMuseSession()) throw new Error('Your pet profile or Muse connection changed. Please send your message again.');
      const transport = isSlideshowRequest(message) || isLocalSocialDraftRequest(message, history, data) ? {} : await getMuseTransport(data.backendUrl);
      if (session !== getMuseSession()) throw new Error('Your care profile changed. Please send your message again.');
      const response = await requestMuse(message, data, history, clientToken, transport);
      await addMuseMessage({ id: `${id()}-muse`, role: 'assistant', content: response.reply, mode: response.mode, proposedActions: response.proposedActions }, session);
      if ('localDestination' in response && response.localDestination === '/slideshow' && session === getMuseSession()) router.push('/slideshow');
      if ('memorySaved' in response && response.memorySaved === false) setError('Your reply is ready, but Muse could not save this turn to page memory. Open Muse page memory to check it or try again.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not contact Muse. Please try again.'); }
    finally { sending.current = false; setPending(false); }
  }
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" onScrollBeginDrag={() => { followChat.current = false; }} onContentSizeChange={() => { if (followChat.current) scroll.current?.scrollToEnd({ animated: true }); }}>
      <View style={styles.header}><View><Text style={styles.eyebrow}>YOUR PET’S COMPANION</Text><Text style={styles.title}>Meet Muse Pet</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Muse connection settings" onPress={onOpenSettings} style={styles.round}><Ionicons name="settings-outline" size={22} color={colors.navy} /></Pressable></View>
      <View style={styles.hero}><View style={[styles.heroCopy, data.pet.avatar && styles.customHeroCopy]}><View style={styles.pill}><View style={styles.dot} /><Text style={styles.pillText}>{data.backendUrl ? 'Connection configured' : 'Preview guide'}</Text></View><Text style={styles.heroTitle}>A little help.{"\n"}A lot of care.</Text><Text style={styles.heroText}>{data.pet.avatar ? 'Your Muse companion.' : 'I’m Kai, your Muse companion.'} Let’s keep {data.pet.name}’s day in view.</Text></View><PetMuseAvatar avatar={data.pet.avatar} style={[styles.mascot, data.pet.avatar && styles.customMascot]} /></View>
      <MuseJourneyGuide data={data} busy={busy} onAsk={send} />
      <View style={styles.checkin}>
        <View style={styles.row}><View style={styles.icon}><Ionicons name="heart-outline" size={22} color={colors.violet} /></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Care, shaped around {data.pet.name}</Text><Text style={styles.caption}>{[data.pet.species, data.pet.breed, data.pet.age].filter(Boolean).join(' · ')}</Text></View></View>
        <Text style={styles.caption}>{data.pet.careNeeds || 'Tell Muse about food sensitivities, comfort needs and the routines your pet already follows.'}</Text>
        <ActionButton label="Edit care profile" icon="heart-outline" onPress={onOpenSettings} />
        <ActionButton label="Find pet supplies" icon="bag-handle-outline" tone="violet" onPress={() => router.push('/shop')} />
        <ActionButton label="Find local dog trainers" icon="school-outline" tone="violet" onPress={() => router.push('/trainers')} />
        <Text style={styles.fine}>Muse uses saved needs and care goals for guidance. Marketplace opens product searches for you to review.</Text>
      </View>
      <View style={styles.checkin}>
        <View style={styles.row}><View style={styles.icon}><Ionicons name="document-text-outline" size={22} color={colors.violet} /></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Muse page memory</Text><Text style={styles.caption}>Care context that can carry forward</Text></View></View>
        <Text style={styles.caption}>Signed-in Facebook care chats on this server can keep useful questions and preferences for this pet page between sessions.</Text>
        <ActionButton label="View Muse page memory" icon="document-text-outline" tone="violet" onPress={() => router.push('/memory')} />
        <Text style={styles.fine}>Review or clear saved memory anytime. Guest demo and token-only chats keep device-local history and do not create server page memory.</Text>
      </View>
      <View style={styles.socialOffer}>
        <View style={styles.socialOfferHeading}>
          <View style={styles.socialStar}><Ionicons name="sparkles-outline" size={24} color={colors.blue} /></View>
          <View style={styles.socialOfferCopy}>
            <Text style={styles.socialEyebrow}>A LITTLE SOCIAL HELP</Text>
            <Text accessibilityRole="header" style={styles.socialTitle}>A little star in the making</Text>
          </View>
        </View>
        <Text style={styles.socialBody}>Let’s plan {data.pet.name}’s Facebook or Instagram page and prepare post drafts with their @handle.</Text>
        <View style={styles.socialPlatforms}>
          <View style={styles.socialPlatform}><Ionicons name="logo-facebook" size={16} color={colors.blue} /><Text style={styles.socialPlatformLabel}>Facebook</Text></View>
          <View style={styles.socialPlatform}><Ionicons name="logo-instagram" size={16} color={colors.violet} /><Text style={styles.socialPlatformLabel}>Instagram</Text></View>
        </View>
        <ActionButton label="Make a memory slideshow" onPress={() => router.push('/slideshow')} icon="images-outline" tone="violet" />
        <ActionButton label="Open social pages" onPress={() => router.push('/social')} icon="arrow-forward" />
        <Text style={styles.caption}>Live post requests send the selected page’s name, @handle, bio and platform to Meta AI. Page URLs stay on this device.</Text>
        <Text style={styles.fine}>Approve drafts to save them here. Review before sharing; publishing needs a connected account.</Text>
      </View>
      <View style={styles.checkin}><View style={styles.row}><View style={styles.icon}><Ionicons name="headset-outline" size={22} color={colors.violet} /></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>A familiar voice, from your desk</Text><Text style={styles.caption}>No collar connected</Text></View></View><View style={styles.audioRow}>{(['mic-outline', 'volume-high-outline', 'mic-off-outline'] as const).map((name, index) => <View key={name} style={styles.audioItem}><View style={styles.audioDisabled}><Ionicons name={name} size={23} color={colors.disabledIcon} /></View><Text style={styles.caption}>{['Talk', 'Listen', 'Mute'][index]}</Text></View>)}<Pressable accessibilityRole="button" onPress={onOpenCollar} style={styles.setup}><Text style={styles.setupText}>Explore collar</Text><Ionicons name="arrow-forward" size={18} color={colors.violet} /></Pressable></View><Text style={styles.fine}>Two-way audio needs a compatible collar with a microphone, speaker and connection. This preview does not access your microphone or stream audio.</Text></View>
      <Text style={styles.sectionTitle}>Ask Muse</Text>
      <Text style={styles.caption}>{data.backendUrl ? 'Your pet profile, care needs, goals and care records are sent to your configured Muse connection when you send a care message.' : 'Try the local demo guide. Connect Muse in Settings for live model responses.'}</Text>
      <Text style={styles.fine}>Your recent conversation and review decisions are saved on this device.</Text>
      <View style={styles.suggestions}>{['Plan my pet’s day', 'What supplies suit my pet?', 'Summarize today', 'Plan a walk', 'Prepare for the vet', 'Draft a pet post', 'Make a slideshow with music'].map(text => <Pressable key={text} accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void send(text)} style={({ pressed }) => [styles.suggestion, (pressed || busy) && { opacity: 0.55 }]}><Text style={styles.suggestionText}>{text}</Text><Ionicons name="arrow-up-outline" size={14} color={colors.violet} /></Pressable>)}</View>
      {messages.map(item => <View key={item.id} style={[styles.message, item.role === 'user' ? styles.userMessage : styles.assistantMessage]}><Text style={[styles.messageLabel, item.role === 'user' && { color: colors.onActionSecondary }]}>{item.role === 'user' ? 'YOU' : item.mode === 'live' ? 'MUSE · LIVE MODEL' : item.mode === 'local' ? 'MUSE · LOCAL STUDIO' : 'MUSE · DEMO GUIDE'}</Text><Text selectable style={[styles.messageText, item.role === 'user' && { color: colors.onAction }]}>{item.content}</Text>{item.proposedActions?.map(action => <MuseActionCard key={action.id} action={action} status={savingActions[action.id] ? 'saving' : Object.hasOwn(decisions, action.id) ? decisions[action.id] : Date.parse(action.expiresAt) <= Date.now() ? 'expired' : 'pending'} onApprove={() => void decide(action, 'approve')} onDismiss={() => void decide(action, 'dismiss')} />)}</View>)}
      {pending && <View style={styles.loading}><ActivityIndicator color={colors.violet} /><Text style={styles.caption}>Preparing a reply…</Text></View>}
      {!!error && <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{error}</Text></View>}
    </ScrollView>
    <View style={styles.composer}><TextInput accessibilityLabel="Message to Muse" placeholder={`Ask about ${data.pet.name}’s day…`} placeholderTextColor={colors.slate} value={draft} onChangeText={setDraft} maxLength={2000} multiline style={styles.input} /><Pressable accessibilityRole="button" accessibilityLabel="Send message to Muse" disabled={!draft.trim() || busy} onPress={() => void send()} style={[styles.send, (!draft.trim() || busy) && { opacity: 0.4 }]}><Ionicons name="arrow-up" size={22} color={colors.onAction} /></Pressable></View>
  </KeyboardAvoidingView>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cloud }, content: { padding: 22, paddingBottom: 28, gap: 16, maxWidth: 700, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 }, eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: '700', color: colors.violet }, title: { fontSize: 29, fontWeight: '800', letterSpacing: -1, color: colors.navy, marginTop: 6 }, round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  hero: { minHeight: 230, borderRadius: 28, backgroundColor: colors.violetWash, flexDirection: 'row', overflow: 'hidden', paddingLeft: 20, paddingTop: 22 }, heroCopy: { width: '58%', zIndex: 1, paddingBottom: 20 }, pill: { flexDirection: 'row', alignItems: 'center', gap: 6 }, dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.violet }, pillText: { color: colors.violet, fontSize: 11, fontWeight: '700' }, heroTitle: { fontSize: 25, fontWeight: '800', lineHeight: 30, color: colors.navy, marginTop: 14, letterSpacing: -0.8 }, heroText: { color: colors.slate, fontSize: 13, lineHeight: 20, marginTop: 10, maxWidth: 190 }, mascot: { position: 'absolute', width: '52%', height: 215, right: -12, bottom: -8 },
  customHeroCopy: { width: '52%' }, customMascot: { width: '44%', height: 190, right: 6, bottom: 6 },
  socialOffer: { padding: 20, gap: 14, borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.blueWash },
  socialOfferHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  socialStar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.surface },
  socialOfferCopy: { flex: 1, gap: 6 },
  socialEyebrow: { color: colors.blue, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  socialTitle: { color: colors.navy, fontSize: 21, lineHeight: 26, fontWeight: '800', letterSpacing: -0.5 },
  socialBody: { color: colors.slate, fontSize: 13, lineHeight: 21 },
  socialPlatforms: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  socialPlatform: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 9, borderRadius: 10, backgroundColor: colors.surface },
  socialPlatformLabel: { color: colors.slate, fontSize: 11, fontWeight: '600' },
  checkin: { backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 17, gap: 14 }, row: { flexDirection: 'row', alignItems: 'center', gap: 11 }, icon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.violetWash, alignItems: 'center', justifyContent: 'center' }, cardTitle: { color: colors.navy, fontSize: 14, fontWeight: '700', lineHeight: 20 }, caption: { color: colors.slate, fontSize: 12, lineHeight: 18 }, audioRow: { flexDirection: 'row', gap: 15, alignItems: 'center' }, audioItem: { gap: 5, alignItems: 'center' }, audioDisabled: { width: 42, height: 42, backgroundColor: colors.cloud, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, setup: { flex: 1, alignItems: 'flex-end', gap: 5, paddingVertical: 8 }, setupText: { fontSize: 12, color: colors.violet, fontWeight: '700' }, fine: { fontSize: 10, lineHeight: 15, color: colors.slate }, sectionTitle: { fontSize: 20, fontWeight: '800', color: colors.navy, marginTop: 5 }, suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, suggestion: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.surface }, suggestionText: { fontSize: 11, fontWeight: '600', color: colors.violet }, message: { padding: 16, borderRadius: 20, maxWidth: '94%', gap: 7 }, userMessage: { backgroundColor: colors.actionBlue, alignSelf: 'flex-end', borderBottomRightRadius: 5 }, assistantMessage: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 5 }, messageLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, color: colors.violet }, messageText: { color: colors.navy, fontSize: 14, lineHeight: 22 }, loading: { flexDirection: 'row', gap: 10, alignItems: 'center' }, error: { padding: 14, borderRadius: 14, backgroundColor: colors.errorWash }, errorText: { color: colors.danger, fontSize: 12, lineHeight: 18 }, composer: { flexDirection: 'row', padding: 14, gap: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.line, alignItems: 'flex-end' }, input: { flex: 1, minHeight: 46, maxHeight: 110, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.navy, backgroundColor: colors.cloud, borderRadius: 18 }, send: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.actionViolet },
});



