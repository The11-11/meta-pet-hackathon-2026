import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../AuthContext';
import { useCare } from '../CareContext';
import { FacebookPhotosError, importFacebookTaggedPhoto, loadFacebookTaggedPhotos, type FacebookTaggedPhoto } from '../facebookPhotos';
import { Field, FormNote, FormPage, FormTitle } from '../components/forms';
import { ActionButton, EmptyCard, Icon, SectionTitle } from '../components/ui';
import { useTheme } from '../ThemeContext';
import type { ThemeColors } from '../theme';
import { emptySlideshow, loadSlideshowDraft, MAX_SLIDESHOW_PHOTOS, moveSlideshowPhoto, saveSlideshowDraft, slideshowStorageKey, SLIDESHOW_TAGS, type SlideshowDraft, type SlideshowTag } from '../slideshowData';
import { downloadSlideshow, exportSlideshow, getSlideshowExportSupport } from '../slideshowExport';
import { slideshowMusicSource, slideshowMusicUri } from '../slideshowMusic';
import { loadSlideshowSamples } from '../slideshowSamples';
import { openSlideshowPhotoSettings, pickSlideshowPhotos, prepareSlideshowPhoto, slideshowPhotosNeedSettings } from '../slideshowPhotos';

const tagLabels: Record<SlideshowTag, string> = { person: 'People', pet: 'Pet', together: 'Together' };

export default function SlideshowRoute() {
  const { owner } = useAuth();
  const { data, ready } = useCare();
  const scope = slideshowStorageKey(owner, data.pet.id);
  if (!scope || !ready) return <FormPage><FormTitle title="Your pet’s photo story" body="Open your pet profile to start your slideshow." /></FormPage>;
  return <SlideshowPage key={scope} scope={scope} petName={data.pet.name || 'your pet'} />;
}

function SlideshowPage({ scope, petName }: { scope: string; petName: string }) {
  const { owner, getMuseTransport, connectFacebookPhotos } = useAuth();
  const { data } = useCare();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [fallback] = useState(() => emptySlideshow(petName));
  const [draft, setDraft] = useState<SlideshowDraft>(fallback);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<'photos' | 'samples' | 'save' | 'export' | 'facebook-connect' | 'facebook-browse' | 'facebook-import' | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [progress, setProgress] = useState(0);
  const [photoSettings, setPhotoSettings] = useState(false);
  const [video, setVideo] = useState<{ result: Awaited<ReturnType<typeof exportSlideshow>>; title: string } | null>(null);
  const [facebookPhotos, setFacebookPhotos] = useState<FacebookTaggedPhoto[]>([]);
  const [facebookCursor, setFacebookCursor] = useState<string>();
  const [facebookBrowsed, setFacebookBrowsed] = useState(false);
  const [facebookImports, setFacebookImports] = useState<Record<string, string>>({});
  const alive = useRef(true);
  const focused = useRef(true);
  const operation = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const player = useAudioPlayer(slideshowMusicSource, { updateInterval: 100 });
  const audio = useAudioPlayerStatus(player);
  const support = getSlideshowExportSupport();
  const duration = draft.photos.length * draft.secondsPerSlide;
  const frame = Math.max(0, Math.min(draft.photos.length - 1, Math.floor(audio.currentTime / draft.secondsPerSlide)));
  const previewing = audio.playing && audio.currentTime < duration;
  const active = useCallback(() => alive.current && focused.current, []);
  const clearFacebookGallery = useCallback(() => { setFacebookPhotos([]); setFacebookCursor(undefined); setFacebookBrowsed(false); setFacebookImports({}); }, []);

  const stop = useCallback(() => { player.pause(); }, [player]);
  const resetPreview = useCallback(() => {
    stop();
    void player.seekTo(0).catch(() => {});
  }, [player, stop]);

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void loadSlideshowDraft(AsyncStorage, scope, fallback).then(value => { if (!cancelled) setDraft(value); })
      .catch(failure => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'The saved slideshow could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; alive.current = false; operation.current?.abort(); };
    // A new owner or pet remounts this component with a new storage scope.
  }, [scope, fallback]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; player.pause(); operation.current?.abort(); clearFacebookGallery(); };
  }, [player, clearFacebookGallery]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') { player.pause(); operation.current?.abort(); } });
    const hidden = () => { if (typeof document !== 'undefined' && document.hidden) { player.pause(); operation.current?.abort(); } };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', hidden);
    return () => { subscription.remove(); if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', hidden); };
  }, [player]);

  useEffect(() => {
    if (audio.playing && audio.currentTime >= duration) player.pause();
  }, [audio.currentTime, audio.playing, duration, player]);

  function change(value: SlideshowDraft) {
    if (inFlight.current || !loaded) return;
    resetPreview(); setDraft(value); setDirty(true); setVideo(null); setMessage(''); setError('');
  }

  async function facebookTransport() {
    if (owner?.mode !== 'facebook') throw new Error('Sign in with Facebook to browse tagged photos, or choose photos from this device.');
    if (!data.backendUrl) throw new Error('The Facebook photo connection is unavailable here. You can choose device photos instead.');
    const expectedOwner = owner.id;
    const transport = await getMuseTransport(data.backendUrl);
    if (!active() || transport.headers?.['X-Muse-Owner'] !== expectedOwner) throw new Error('Your Facebook account changed. Reopen this pet’s slideshow and try again.');
    return transport;
  }

  async function allowFacebookPhotos() {
    if (inFlight.current || !loaded || owner?.mode !== 'facebook') return;
    if (dirty) { setError('Save your slideshow on this device before opening Facebook, so your current changes are kept.'); return; }
    inFlight.current = true; setBusy('facebook-connect'); resetPreview(); clearFacebookGallery(); setError(''); setMessage('');
    try {
      await connectFacebookPhotos();
      if (active()) setMessage('After allowing photo access on Facebook, choose Browse tagged photos. Facebook controls which photos are available.');
    } catch (failure) { if (active()) setError(failure instanceof Error ? failure.message : 'Facebook photo access was not granted. You can use device photos instead.'); }
    finally { inFlight.current = false; if (alive.current) setBusy(null); }
  }

  async function browseFacebookPhotos(after?: string) {
    if (inFlight.current || !loaded) return;
    inFlight.current = true; setBusy('facebook-browse'); resetPreview(); setError(''); setMessage('');
    const controller = new AbortController(); operation.current = controller;
    try {
      const transport = await facebookTransport();
      const result = await loadFacebookTaggedPhotos(data.backendUrl, transport, after, controller.signal);
      if (!active() || controller.signal.aborted) return;
      setFacebookPhotos(result.photos.filter((photo, index) => result.photos.findIndex(item => item.id === photo.id) === index));
      setFacebookCursor(result.nextCursor);
      setFacebookBrowsed(true);
      if (!result.photos.length && !after) setMessage('Facebook returned no available tagged photos. You can choose photos from this device instead.');
    } catch (failure) { if (active()) { setFacebookPhotos([]); setFacebookCursor(undefined); setFacebookBrowsed(false); setError(failure instanceof Error ? failure.message : 'Facebook could not provide tagged photos. Check photo access or use device photos.'); } }
    finally { if (operation.current === controller) operation.current = null; inFlight.current = false; if (alive.current) setBusy(null); }
  }

  async function addFacebookPhoto(photoId: string) {
    if (inFlight.current || !loaded || draft.photos.length >= MAX_SLIDESHOW_PHOTOS) return;
    inFlight.current = true; setBusy('facebook-import'); resetPreview(); setError(''); setMessage('');
    const controller = new AbortController(); operation.current = controller;
    try {
      const transport = await facebookTransport();
      const imported = await importFacebookTaggedPhoto(data.backendUrl, transport, photoId, controller.signal);
      if (!active() || controller.signal.aborted) return;
      const compact = await prepareSlideshowPhoto(imported.dataUrl, imported.width, imported.height);
      if (!active() || controller.signal.aborted) return;
      // Store only the compressed local photo. Facebook IDs, captions and CDN
      // URLs remain transient gallery data and never reach model or draft storage.
      setDraft(previous => ({ ...previous, photos: [...previous.photos, compact] }));
      setFacebookImports(previous => ({ ...previous, [photoId]: compact.id }));
      setDirty(true); setVideo(null); setMessage('Photo added. Choose its label and an optional caption below, then save your slideshow.');
    } catch (failure) { if (active()) { if (failure instanceof FacebookPhotosError && (failure.status === 401 || failure.status === 403)) clearFacebookGallery(); setError(failure instanceof Error ? failure.message : 'This Facebook photo could not be added. Try another or choose a device photo.'); } }
    finally { if (operation.current === controller) operation.current = null; inFlight.current = false; if (alive.current) setBusy(null); }
  }

  async function choosePhotos() {
    if (inFlight.current || !loaded) return;
    inFlight.current = true; setBusy('photos'); resetPreview(); setError(''); setPhotoSettings(false); setMessage('');
    try {
      const photos = await pickSlideshowPhotos(MAX_SLIDESHOW_PHOTOS - draft.photos.length);
      if (active() && photos.length) { setDraft(previous => ({ ...previous, photos: [...previous.photos, ...photos] })); setDirty(true); setVideo(null); }
    } catch (failure) { if (active()) { setError(failure instanceof Error ? failure.message : 'The photos could not be opened. Try choosing them again.'); setPhotoSettings(slideshowPhotosNeedSettings(failure)); } }
    finally { inFlight.current = false; if (alive.current) setBusy(null); }
  }

  async function trySampleStory() {
    if (inFlight.current || !loaded || draft.photos.length >= MAX_SLIDESHOW_PHOTOS) return;
    inFlight.current = true; setBusy('samples'); resetPreview(); setError(''); setMessage('');
    const controller = new AbortController(); operation.current = controller;
    try {
      const photos = await loadSlideshowSamples(MAX_SLIDESHOW_PHOTOS - draft.photos.length, controller.signal);
      if (!active() || controller.signal.aborted) return;
      setDraft(previous => ({ ...previous, photos: [...previous.photos, ...photos] }));
      setDirty(true); setVideo(null); setMessage('Sample artwork added. Try Play with music, then create a video. These are project illustrations, not Facebook photos.');
    } catch (failure) { if (active()) setError(failure instanceof Error ? failure.message : 'The sample story could not load. Please try again.'); }
    finally { if (operation.current === controller) operation.current = null; inFlight.current = false; if (alive.current) setBusy(null); }
  }

  async function save() {
    if (inFlight.current || !loaded) return;
    inFlight.current = true; setBusy('save'); setError(''); setMessage('');
    try {
      await saveSlideshowDraft(AsyncStorage, scope, draft, active);
      if (active()) { setDirty(false); setMessage('Slideshow saved on this device for this pet page.'); }
    } catch (failure) { if (active()) setError(failure instanceof Error ? failure.message : 'The slideshow could not be saved. Your selected photos are still here.'); }
    finally { inFlight.current = false; if (alive.current) setBusy(null); }
  }

  function play() {
    if (!draft.photos.length || !audio.isLoaded || inFlight.current) return;
    setError('');
    if (audio.currentTime >= duration - 0.05) { resetPreview(); setMessage('Ready from the start. Press Play.'); return; }
    try { player.play(); setMessage(''); }
    catch { setError('The music could not play. Press Play to try again.'); }
  }

  async function download() {
    if (inFlight.current || !draft.photos.length || !draft.title.trim() || !support.supported) return;
    inFlight.current = true; setBusy('export'); resetPreview(); setVideo(null); setProgress(0); setError(''); setMessage('');
    const controller = new AbortController(); operation.current = controller;
    try {
      const musicUri = slideshowMusicUri();
      if (!musicUri) throw new Error('The bundled music could not load for video creation. Please reload and try again.');
      const result = await exportSlideshow({ title: draft.title, photos: draft.photos, secondsPerSlide: draft.secondsPerSlide, musicUri }, { signal: controller.signal, onProgress: (fraction: number) => { if (active()) setProgress(fraction); } });
      if (!active() || controller.signal.aborted) return;
      if (!result.supported) throw new Error(result.reason);
      setVideo({ result, title: draft.title });
      setMessage('Your video is ready. Choose Save video, then review it before sharing.');
    } catch (failure) { if (active()) setError(controller.signal.aborted ? 'Video creation cancelled. Your photos are still here.' : failure instanceof Error ? failure.message : 'The video could not be created. Try again in a supported browser.'); }
    finally { if (operation.current === controller) operation.current = null; inFlight.current = false; if (alive.current) setBusy(null); }
  }

  function saveVideo() {
    if (!video?.result.supported || !active()) return;
    try { downloadSlideshow(video.result, video.title); setMessage('Video download started. Check your browser’s downloads.'); }
    catch { setError('The download could not start. Keep this page open and choose Save video again.'); }
  }

  const photo = draft.photos[Math.max(0, Math.min(frame, draft.photos.length - 1))];
  const disabled = !!busy || !loaded;
  return <FormPage>
    <FormTitle title="You, your pet, your story" body="Choose favourite moments. Muse brings them together with original music." />
    <FormNote>Use photos you’re tagged in on Facebook, or choose photos from your device. Make a story with up to eight favourite moments.</FormNote>
    {error ? <FormNote error>{error}</FormNote> : null}
    {photoSettings ? <ActionButton label="Open photo settings" tone="navy" onPress={() => { void openSlideshowPhotoSettings().catch(() => setError('Phone settings could not open. Open your device settings and allow photo access.')); }} /> : null}
    {message ? <FormNote>{message}</FormNote> : null}
    <Field label="Slideshow title" value={draft.title} onChange={title => change({ ...draft, title })} maxLength={80} placeholder="Our favourite moments" />
    <View style={styles.card}>
      <SectionTitle title="Try a sample story" />
      <Text style={styles.body}>See the music and video flow with Muse Dog and collar concept artwork before choosing your own photos.</Text>
      <ActionButton label={busy === 'samples' ? 'Preparing sample artwork…' : 'Try sample story'} icon="sparkles-outline" tone="violet" onPress={() => void trySampleStory()} disabled={disabled || draft.photos.length >= MAX_SLIDESHOW_PHOTOS} />
      <Text style={styles.fine}>Sample artwork only. Adds up to two pictures to the free slots without replacing your photos or title. No Facebook or photo-library access is needed.</Text>
    </View>
    <View style={styles.card}>
      <SectionTitle title="Photos you’re tagged in" />
      <Text style={styles.body}>Choose from the photos Facebook makes available to your account and this app.</Text>
      {owner?.mode === 'facebook' ? <>
        <ActionButton label={busy === 'facebook-connect' ? 'Opening Facebook…' : 'Allow Facebook photo access'} icon="logo-facebook" onPress={() => void allowFacebookPhotos()} disabled={disabled} />
        <ActionButton label={busy === 'facebook-browse' ? 'Loading tagged photos…' : 'Browse tagged photos'} tone="violet" onPress={() => void browseFacebookPhotos()} disabled={disabled} />
      </> : <FormNote>Facebook sign-in is needed for tagged photos. You can still build your story with photos from this device.</FormNote>}
      <Text style={styles.fine}>Photo access is optional. If Facebook cannot provide it for this app, use device photos. Adding a photo fetches it through Meta Pet’s server; saving keeps a compressed copy on this device. These photos are not sent to AI.</Text>
      {facebookPhotos.map((item, index) => {
        const added = draft.photos.some(entry => entry.id === facebookImports[item.id]);
        return <View key={item.id} style={styles.facebookPhoto}>
          <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} accessibilityLabel={`Facebook tagged photo ${index + 1}`} />
          <View style={styles.photoCopy}><Text numberOfLines={2} style={styles.body}>{item.caption || `Tagged photo ${index + 1}`}</Text><ActionButton label={added ? 'Photo added' : 'Add this photo'} icon="add-outline" onPress={() => void addFacebookPhoto(item.id)} disabled={disabled || added || draft.photos.length >= MAX_SLIDESHOW_PHOTOS} /></View>
        </View>;
      })}
      {facebookBrowsed && !facebookPhotos.length ? <Text style={styles.fine}>No tagged photos are available here. Choose a device photo below.</Text> : null}
      {facebookCursor ? <ActionButton label="Next tagged photos" tone="navy" onPress={() => void browseFacebookPhotos(facebookCursor)} disabled={disabled} /> : null}
    </View>
    <SectionTitle title="Or choose device photos" />
    <ActionButton label={busy === 'photos' ? 'Preparing your photos…' : 'Choose device photos'} icon="images-outline" onPress={() => void choosePhotos()} disabled={disabled || draft.photos.length >= MAX_SLIDESHOW_PHOTOS} />
    <Text style={styles.fine}>People, Pet and Together are your own organising labels below. They do not create Facebook tags or recognise faces. Device photos are processed locally.</Text>
    <SectionTitle title="Your photo story" aside={`${draft.photos.length} / ${MAX_SLIDESHOW_PHOTOS} photos`} />
    {!draft.photos.length ? <EmptyCard icon="heart-outline" title="Start with a favourite moment" body="Add photos of you, your pet, or the two of you together." /> : draft.photos.map((item, index) => <View key={item.id} style={styles.card}>
      <View style={styles.photoHeading}><Image source={{ uri: item.uri }} style={styles.thumbnail} accessibilityLabel={`Selected photo ${index + 1}`} /><View style={styles.photoCopy}><Text style={styles.photoTitle}>Photo {index + 1}</Text><Text style={styles.fine}>{tagLabels[item.tag]}</Text></View></View>
      <View accessibilityRole="radiogroup" accessibilityLabel={`Photo ${index + 1} label`} style={styles.options}>
        {SLIDESHOW_TAGS.map(tag => <Pressable key={tag} disabled={disabled} accessibilityRole="radio" accessibilityLabel={`${tagLabels[tag]} in photo ${index + 1}`} accessibilityState={{ checked: item.tag === tag, disabled }} style={[styles.choice, item.tag === tag && styles.selected]} onPress={() => change({ ...draft, photos: draft.photos.map(entry => entry.id === item.id ? { ...entry, tag } : entry) })}><Text style={styles.choiceText}>{tagLabels[tag]}</Text></Pressable>)}
      </View>
      <Field label={`Photo ${index + 1} caption (optional)`} value={item.caption} maxLength={140} onChange={caption => change({ ...draft, photos: draft.photos.map(entry => entry.id === item.id ? { ...entry, caption } : entry) })} placeholder="A little moment to remember" />
      <View style={styles.options}>
        <SmallButton label={`Move photo ${index + 1} earlier`} text="Earlier" icon="arrow-up-outline" disabled={disabled || index === 0} onPress={() => change(moveSlideshowPhoto(draft, item.id, -1))} styles={styles} />
        <SmallButton label={`Move photo ${index + 1} later`} text="Later" icon="arrow-down-outline" disabled={disabled || index === draft.photos.length - 1} onPress={() => change(moveSlideshowPhoto(draft, item.id, 1))} styles={styles} />
        <SmallButton label={`Remove photo ${index + 1}`} text="Remove" icon="trash-outline" disabled={disabled} onPress={() => change({ ...draft, photos: draft.photos.filter(entry => entry.id !== item.id) })} styles={styles} />
      </View>
    </View>)}
    <SectionTitle title="Set the pace" aside={`${duration} seconds total`} />
    <View accessibilityRole="radiogroup" accessibilityLabel="Seconds per photo" style={styles.options}>{([3, 4, 5, 6] as const).map(seconds => <Pressable key={seconds} disabled={disabled} accessibilityRole="radio" accessibilityLabel={`${seconds} seconds per photo`} accessibilityState={{ checked: draft.secondsPerSlide === seconds, disabled }} style={[styles.choice, draft.secondsPerSlide === seconds && styles.selected]} onPress={() => change({ ...draft, secondsPerSlide: seconds })}><Text style={styles.choiceText}>{seconds}s</Text></Pressable>)}</View>
    <SectionTitle title="Preview your story" />
    {photo ? <View style={styles.preview}><Image source={{ uri: photo.uri }} resizeMode="contain" style={styles.previewImage} accessibilityLabel={`Preview photo ${frame + 1} of ${draft.photos.length}`} /><View style={styles.previewCopy}><Text style={styles.previewTitle}>{draft.title || 'Your photo story'}</Text>{photo.caption ? <Text style={styles.previewCaption}>{photo.caption}</Text> : null}<Text style={styles.fine}>Photo {Math.min(frame + 1, draft.photos.length)} of {draft.photos.length} · {tagLabels[photo.tag]}</Text></View></View> : null}
    <View style={styles.options}><View style={styles.flex}><ActionButton label={previewing ? 'Pause preview' : 'Play with music'} icon={previewing ? 'pause-outline' : 'play-outline'} disabled={disabled || !photo || !audio.isLoaded} onPress={previewing ? stop : play} /></View><View style={styles.flex}><ActionButton label="Restart preview" icon="play-skip-back-outline" tone="navy" disabled={disabled || !photo} onPress={resetPreview} /></View></View>
    <Text style={styles.fine}>{audio.error ? 'Music could not load. Reload this screen to try again.' : !audio.isLoaded ? 'Loading the original music…' : 'Original Meta Pet music. Sound begins only when you press Play.'}</Text>
    <ActionButton label={busy === 'save' ? 'Saving slideshow…' : 'Save slideshow on this device'} icon="save-outline" tone="violet" onPress={() => void save()} disabled={disabled || !draft.title.trim()} />
    <Text style={styles.fine}>{dirty ? 'You have unsaved changes.' : 'Saved slideshows belong to this account and pet page on this device.'}</Text>
    <ActionButton label={busy === 'export' ? `Creating video… ${Math.round(progress * 100)}%` : 'Create video with music'} icon="videocam-outline" onPress={() => void download()} disabled={disabled || !photo || !draft.title.trim() || !support.supported} />
    {video?.result.supported ? <ActionButton label="Save video" icon="download-outline" tone="violet" onPress={saveVideo} disabled={disabled} /> : null}
    {busy === 'export' ? <ActionButton label="Cancel video creation" tone="navy" onPress={() => operation.current?.abort()} /> : null}
    <Text style={styles.fine}>{support.supported ? 'Video creation runs in this browser. Keep this page open; nothing is posted to a social account.' : support.reason || 'Video download is available in supported browsers. You can preview and save your slideshow here.'}</Text>
  </FormPage>;
}

function SmallButton({ label, text, icon, disabled, onPress, styles }: { label: string; text: string; icon: 'arrow-up-outline' | 'arrow-down-outline' | 'trash-outline'; disabled: boolean; onPress: () => void; styles: ReturnType<typeof createStyles> }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.smallButton, disabled && styles.disabled]}><Icon name={icon} size={18} /><Text style={styles.choiceText}>{text}</Text></Pressable>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { gap: 14, padding: 16, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  photoHeading: { flexDirection: 'row', gap: 14, alignItems: 'center' }, thumbnail: { width: 88, height: 88, resizeMode: 'cover', borderRadius: 14, backgroundColor: colors.cloud }, photoCopy: { flex: 1, gap: 4 }, photoTitle: { color: colors.navy, fontSize: 17, fontWeight: '700' },
  facebookPhoto: { flexDirection: 'row', gap: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14 }, body: { color: colors.navy, fontSize: 14, lineHeight: 22 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, flex: { flex: 1, minWidth: 130 },
  choice: { minWidth: 56, minHeight: 44, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, selected: { backgroundColor: colors.blueWash, borderColor: colors.blue }, choiceText: { color: colors.navy, fontSize: 13, fontWeight: '700' },
  smallButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 12, padding: 10, backgroundColor: colors.cloud }, disabled: { opacity: 0.4 },
  preview: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }, previewImage: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#071425' }, previewCopy: { padding: 18, gap: 6 }, previewTitle: { color: colors.navy, fontSize: 20, fontWeight: '800' }, previewCaption: { color: colors.navy, fontSize: 14, lineHeight: 21 }, fine: { color: colors.slate, fontSize: 12, lineHeight: 19 },
});
