import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../AuthContext';
import { useCare } from '../CareContext';
import { BrandHeader } from '../components/BrandHeader';
import { Field, FormNote, FormTitle } from '../components/forms';
import { ActionButton, EmptyCard, Icon, SectionTitle, type IconName } from '../components/ui';
import { normalizePetHandle, restoreSocialState, socialPlatformLabels, withPetMention } from '../socialData';
import { useTheme } from '../ThemeContext';
import type { ThemeColors } from '../theme';
import type { SocialPlatform, SocialPost, SocialProfile } from '../types';

const platforms: SocialPlatform[] = ['facebook', 'instagram'];
const intents: { value: SocialProfile['intent']; label: string; icon: IconName }[] = [
  { value: 'create', label: 'Create page plan', icon: 'add-circle-outline' },
  { value: 'manage', label: 'Manage existing page', icon: 'settings-outline' },
];

export default function SocialRoute() {
  const { data } = useCare();
  const { owner } = useAuth();
  return <SocialPage key={JSON.stringify([owner?.mode, owner?.id, data.pet.id])} />;
}

function SocialPage() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, saveSocialProfile, updateSocialPost } = useCare();
  const social = useMemo(() => restoreSocialState(data.social), [data.social]);
  const [intent, setIntent] = useState<SocialProfile['intent']>('create');
  const [platform, setPlatform] = useState<SocialPlatform>('facebook');
  const [displayName, setDisplayName] = useState(data.pet.name);
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [url, setUrl] = useState('');
  const [editingProfileId, setEditingProfileId] = useState<string>();
  const [editingPostId, setEditingPostId] = useState<string>();
  const [caption, setCaption] = useState('');
  const [pending, setPending] = useState<'profile' | 'post' | null>(null);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [postMessage, setPostMessage] = useState('');
  const [postError, setPostError] = useState('');
  const inFlight = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const busy = pending !== null;
  const editingPost = social.posts.find(post => post.id === editingPostId);
  let captionPreview = '';
  let captionIssue = '';
  if (editingPost) {
    try { captionPreview = withPetMention(caption, editingPost.petHandle); }
    catch (failure) {
      captionIssue = failure instanceof Error ? failure.message : 'Check your caption before saving.';
      captionPreview = `${caption.trim()}\n\n@${editingPost.petHandle}`.trim();
    }
  }

  function resetProfileEditor() {
    setEditingProfileId(undefined);
    setIntent('create');
    setPlatform('facebook');
    setDisplayName(data.pet.name);
    setHandle('');
    setBio('');
    setUrl('');
  }

  function editProfile(profile: SocialProfile) {
    if (inFlight.current) return;
    setEditingProfileId(profile.id);
    setIntent(profile.intent);
    setPlatform(profile.platform);
    setDisplayName(profile.displayName);
    setHandle(profile.handle);
    setBio(profile.bio);
    setUrl(profile.url);
    setProfileError('');
    setProfileMessage('Editing your saved page details.');
    Keyboard.dismiss();
    scroll.current?.scrollTo({ y: 0, animated: true });
  }

  async function saveProfile() {
    if (inFlight.current) return;
    setProfileError('');
    setProfileMessage('');
    if (!displayName.trim()) { setProfileError('Add a display name for your pet’s page.'); return; }
    let normalizedHandle: string;
    try { normalizedHandle = normalizePetHandle(handle); }
    catch (failure) { setProfileError(failure instanceof Error ? failure.message : 'Check your pet’s handle.'); return; }
    inFlight.current = true;
    setPending('profile');
    Keyboard.dismiss();
    try {
      await saveSocialProfile({ platform, displayName: displayName.trim(), handle: normalizedHandle, bio: bio.trim(), intent, url: url.trim() }, editingProfileId);
      setProfileMessage(intent === 'create' ? 'Page plan saved on this device.' : 'Page details saved on this device.');
      resetProfileEditor();
    } catch (failure) {
      setProfileError(failure instanceof Error ? failure.message : 'The page plan could not be saved. Your details are still here.');
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  function editPost(post: SocialPost) {
    if (inFlight.current) return;
    setEditingPostId(post.id);
    setCaption(post.caption);
    setPostError('');
    setPostMessage('');
  }

  async function savePost() {
    if (inFlight.current || !editingPost || captionIssue) return;
    inFlight.current = true;
    setPending('post');
    setPostError('');
    setPostMessage('');
    Keyboard.dismiss();
    try {
      await updateSocialPost(editingPost.id, withPetMention(caption, editingPost.petHandle));
      setEditingPostId(undefined);
      setCaption('');
      setPostMessage('Caption saved on this device, with your pet’s @handle included.');
    } catch (failure) {
      setPostError(failure instanceof Error ? failure.message : 'The caption could not be saved. Please try again.');
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  return <View style={styles.root}>
    <BrandHeader />
    <ScrollView ref={scroll} style={styles.root} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Icon name="sparkles-outline" color={colors.blue} size={25} /></View>
        <Text style={styles.eyebrow}>A LITTLE STAR IN THE MAKING</Text>
        <Text accessibilityRole="header" style={styles.title}>{data.pet.name}’s social world</Text>
        <Text style={styles.body}>Plan a pet page, keep its details together, and shape a few lovely posts with Muse.</Text>
        <Text style={styles.connectionStatus}>{data.backendUrl ? 'Live Muse configured' : 'Local guide'}</Text>
        <ActionButton label="Make a memory slideshow" icon="images-outline" tone="violet" disabled={busy} onPress={() => router.push('/slideshow')} />
        <ActionButton label="Open Muse" icon="chatbubble-ellipses-outline" disabled={busy} onPress={() => router.push('/muse')} />
      </View>

      <FormNote>Muse adds your pet’s @handle to each draft. Review before sharing. Publishing needs a connected account.</FormNote>
      <FormNote>When you ask live Muse for a post, the selected page’s name, @handle, bio and platform go to Meta AI. Page URLs stay on this device.</FormNote>

      <View style={styles.editor}>
        <FormTitle title={editingProfileId ? 'Edit page details' : 'Start with a page plan'}
          body="Save the details on this device. Creating a page or connecting it for publishing is a separate step." />
        <View accessibilityRole="radiogroup" accessibilityLabel="Social page plan type" style={styles.choiceRow}>
          {intents.map(option => <Pressable key={option.value} accessibilityRole="radio"
            accessibilityState={{ checked: intent === option.value, disabled: busy }} aria-checked={intent === option.value}
            disabled={busy} onPress={() => setIntent(option.value)}
            style={({ pressed }) => [styles.choice, intent === option.value && styles.choiceSelected, pressed && styles.pressed, busy && styles.disabled]}>
            <Icon name={option.icon} color={intent === option.value ? colors.blue : colors.slate} size={23} />
            <Text style={[styles.choiceLabel, intent === option.value && styles.selectedLabel]}>{option.label}</Text>
          </Pressable>)}
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Platform</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Social platform" style={styles.choiceRow}>
            {platforms.map(service => <Pressable key={service} accessibilityRole="radio"
              accessibilityState={{ checked: platform === service, disabled: busy || !!editingProfileId }} aria-checked={platform === service}
              disabled={busy || !!editingProfileId} onPress={() => setPlatform(service)}
              style={({ pressed }) => [styles.platformChoice, platform === service && styles.choiceSelected, pressed && styles.pressed, (busy || !!editingProfileId) && styles.disabled]}>
              <Icon name={service === 'facebook' ? 'logo-facebook' : 'logo-instagram'} color={platform === service ? colors.blue : colors.slate} size={20} />
              <Text style={[styles.choiceLabel, platform === service && styles.selectedLabel]}>{socialPlatformLabels[service]}</Text>
            </Pressable>)}
          </View>
          {editingProfileId ? <Text style={styles.fine}>The platform stays the same when you edit a saved page.</Text> : null}
        </View>
        <View pointerEvents={busy ? 'none' : 'auto'} style={styles.fields}>
          <Field label="Page display name" value={displayName} maxLength={80} placeholder="Your pet’s name"
            onChange={value => { if (!inFlight.current) setDisplayName(value); }} />
          <Field label="Pet @handle" value={handle} maxLength={51} placeholder="e.g. yourpet.adventures"
            onChange={value => { if (!inFlight.current) setHandle(value); }} />
          <Text style={styles.fine}>Use your pet’s handle here. This saves a plan; it does not reserve the username.</Text>
          <Field label="Bio (optional)" value={bio} maxLength={500} multiline placeholder="A little introduction to your pet"
            onChange={value => { if (!inFlight.current) setBio(value); }} />
          <Field label={intent === 'manage' ? 'Existing page URL (optional)' : 'Public page URL (optional)'} value={url} maxLength={500}
            placeholder={platform === 'facebook' ? 'https://www.facebook.com/yourpet' : 'https://www.instagram.com/yourpet/'}
            onChange={value => { if (!inFlight.current) setUrl(value); }} />
        </View>
        {!!profileMessage && <View accessibilityLiveRegion="polite"><FormNote>{profileMessage}</FormNote></View>}
        {!!profileError && <FormNote error>{profileError}</FormNote>}
        <ActionButton label={pending === 'profile' ? 'Saving on this device…' : editingProfileId ? 'Save changes on this device' : intent === 'create' ? 'Save page plan on this device' : 'Save page details on this device'}
          disabled={busy} onPress={() => void saveProfile()} />
        {editingProfileId ? <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy }}
          onPress={() => { resetProfileEditor(); setProfileMessage(''); setProfileError(''); }}
          style={({ pressed }) => [styles.textButton, pressed && styles.pressed, busy && styles.disabled]}>
          <Text style={styles.textButtonLabel}>Cancel editing</Text>
        </Pressable> : null}
      </View>

      <View style={styles.section}>
        <SectionTitle title="Saved page plans" aside={`${social.profiles.length} saved`} />
        {social.profiles.length ? social.profiles.map(profile => <View key={profile.id} style={styles.savedCard}>
          <View style={styles.cardHeading}>
            <View style={styles.platformIcon}><Icon name={profile.platform === 'facebook' ? 'logo-facebook' : 'logo-instagram'} color={colors.blue} /></View>
            <View style={styles.cardCopy}>
              <Text style={styles.cardEyebrow}>{socialPlatformLabels[profile.platform]} · {profile.intent === 'create' ? 'Page plan' : 'Existing page details'}</Text>
              <Text style={styles.cardTitle}>{profile.displayName}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${profile.displayName} ${socialPlatformLabels[profile.platform]} page plan`}
              accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => editProfile(profile)}
              style={({ pressed }) => [styles.editButton, pressed && styles.pressed, busy && styles.disabled]}>
              <Icon name="create-outline" color={colors.blue} size={20} />
            </Pressable>
          </View>
          <Text selectable style={styles.handle}>@{profile.handle}</Text>
          {profile.bio ? <Text selectable style={styles.body}>{profile.bio}</Text> : null}
          {profile.url ? <Text selectable style={styles.savedUrl}>{profile.url}</Text> : null}
          <Text style={styles.fine}>Saved on this device · Publishing is not connected</Text>
        </View>) : <EmptyCard icon="paw-outline" title="Their story starts here" body="Save a page plan with your pet’s @handle. Muse can then help prepare tagged post drafts." />}
      </View>

      <View style={styles.section}>
        <SectionTitle title="Post drafts" aside={`${social.posts.length} saved`} />
        <Text style={styles.body}>Ask Muse for a pet post, then approve its draft to save it here.</Text>
        {!!postMessage && <View accessibilityLiveRegion="polite"><FormNote>{postMessage}</FormNote></View>}
        {social.posts.length ? social.posts.map(post => {
          const profile = social.profiles.find(item => item.id === post.profileId);
          const isEditing = post.id === editingPostId;
          return <View key={post.id} style={styles.savedCard}>
            <View style={styles.cardHeading}>
              <View style={styles.draftIcon}><Icon name="document-text-outline" color={colors.violet} /></View>
              <View style={styles.cardCopy}>
                <Text style={styles.cardEyebrow}>{socialPlatformLabels[post.platform]} · Draft</Text>
                <Text style={styles.cardTitle}>{profile?.displayName || data.pet.name}</Text>
              </View>
            </View>
            {isEditing ? <>
              <Field label="Edit post caption" value={caption} multiline maxLength={1800}
                onChange={value => { if (!inFlight.current) setCaption(value); }} />
              <Text style={styles.fieldLabel}>Caption preview · pet tag included</Text>
              <Text selectable style={styles.captionPreview}>{captionPreview}</Text>
              <Text style={styles.fine}>{captionPreview.length.toLocaleString()} / 1,800 characters, including your pet’s tag</Text>
              {captionIssue && caption.trim() ? <FormNote error>{captionIssue}</FormNote> : null}
              {!!postError && <FormNote error>{postError}</FormNote>}
              <ActionButton label={pending === 'post' ? 'Saving caption…' : 'Save caption on this device'} tone="violet"
                disabled={busy || !!captionIssue} onPress={() => void savePost()} />
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy}
                onPress={() => { setEditingPostId(undefined); setCaption(''); setPostError(''); }}
                style={({ pressed }) => [styles.textButton, pressed && styles.pressed, busy && styles.disabled]}>
                <Text style={styles.textButtonLabel}>Cancel caption edit</Text>
              </Pressable>
            </> : <>
              <Text selectable style={styles.captionPreview}>{withPetMention(post.caption, post.petHandle)}</Text>
              {post.note ? <Text style={styles.fine}>{post.note}</Text> : null}
              <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${socialPlatformLabels[post.platform]} caption for @${post.petHandle}`}
                accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => editPost(post)}
                style={({ pressed }) => [styles.captionEdit, pressed && styles.pressed, busy && styles.disabled]}>
                <Icon name="create-outline" color={colors.violet} size={18} />
                <Text style={styles.captionEditLabel}>Edit caption</Text>
              </Pressable>
            </>}
          </View>;
        }) : <EmptyCard icon="chatbubble-ellipses-outline" title="A little inspiration from Muse" body="Your approved post drafts will appear here with your pet’s @handle included. Nothing is published from this screen." />}
      </View>
    </ScrollView>
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cloud },
  page: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: 24, paddingBottom: 44, gap: 24 },
  hero: { backgroundColor: colors.blueWash, borderRadius: 25, padding: 20, gap: 13 },
  heroIcon: { width: 46, height: 46, backgroundColor: colors.surface, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: colors.blue, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.navy, fontSize: 29, lineHeight: 35, fontWeight: '800', letterSpacing: -0.8 },
  body: { color: colors.slate, fontSize: 13, lineHeight: 21 },
  connectionStatus: { color: colors.blue, fontSize: 11, lineHeight: 18, fontWeight: '700' },
  editor: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 23, padding: 18, gap: 18 },
  choiceRow: { flexDirection: 'row', gap: 10 },
  choice: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 9, minHeight: 92, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.cloud },
  choiceSelected: { borderColor: colors.blue, backgroundColor: colors.blueWash },
  choiceLabel: { color: colors.slate, fontSize: 12, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
  selectedLabel: { color: colors.blue },
  fieldGroup: { gap: 10 },
  fieldLabel: { color: colors.navy, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  platformChoice: { flex: 1, minHeight: 54, paddingHorizontal: 8, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 15, backgroundColor: colors.cloud },
  fields: { gap: 17 },
  fine: { color: colors.slate, fontSize: 11, lineHeight: 18 },
  textButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 10 },
  textButtonLabel: { color: colors.slate, fontSize: 13, fontWeight: '700' },
  section: { gap: 14 },
  savedCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 22, padding: 18, gap: 14 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  platformIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blueWash },
  draftIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violetWash },
  cardCopy: { flex: 1, gap: 5 },
  cardEyebrow: { color: colors.slate, fontSize: 10, lineHeight: 16, fontWeight: '600' },
  cardTitle: { color: colors.navy, fontSize: 17, lineHeight: 23, fontWeight: '700' },
  editButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.blueWash, alignItems: 'center', justifyContent: 'center' },
  handle: { color: colors.blue, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  savedUrl: { color: colors.blue, fontSize: 11, lineHeight: 18 },
  captionPreview: { color: colors.navy, fontSize: 14, lineHeight: 23, backgroundColor: colors.cloud, borderRadius: 15, padding: 15 },
  captionEdit: { minHeight: 44, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, paddingHorizontal: 8, paddingVertical: 10 },
  captionEditLabel: { color: colors.violet, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
});
