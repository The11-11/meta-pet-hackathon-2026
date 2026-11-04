import { useMemo, useRef, useState } from 'react';
import { PUBLIC_DEMO_ONLY } from '../demoMode';
import { openPetPhotoSettings, petPhotoNeedsSettings } from '../petPhoto';
import { ActivityIndicator, Image, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BrandHeader } from '../components/BrandHeader';
import { Field, FormNote } from '../components/forms';
import { MuseDog } from '../components/MuseDog';
import { OnboardingMuseConnection, type OnboardingPreviewConnection } from '../components/OnboardingMuseConnection';
import { ActionButton, Icon, type IconName } from '../components/ui';
import { useTheme } from '../ThemeContext';
import type { ThemeColors } from '../theme';
import type { CareKind, PetAvatar, PetPhoto, PetProfile } from '../types';

export type OnboardingScreenProps = {
  ownerName: string;
  mode: 'facebook' | 'demo';
  initialPet: PetProfile;
  initialAvatar?: PetAvatar;
  previewConnection?: OnboardingPreviewConnection;
  facebookSignInRequired?: boolean;
  onPickPhoto: (source: 'camera' | 'library') => Promise<PetPhoto | null>;
  onGenerateAvatar: (photo: PetPhoto, pet: PetProfile) => Promise<PetAvatar>;
  onComplete: (pet: PetProfile, goals: CareKind[], avatar?: PetAvatar) => Promise<void>;
  onSignOut: () => Promise<void>;
};

type SetupStep = 0 | 1 | 2 | 3;

const speciesOptions = ['Dog', 'Cat', 'Other'] as const;
const careOptions: { kind: CareKind; title: string; detail: string; icon: IconName }[] = [
  { kind: 'feeding', title: 'Feeding', detail: 'Meals and everyday nutrition', icon: 'restaurant-outline' },
  { kind: 'walk', title: 'Walks', detail: 'Movement and time outdoors', icon: 'walk-outline' },
  { kind: 'training', title: 'Training', detail: 'Small steps and new skills', icon: 'ribbon-outline' },
  { kind: 'sleep', title: 'Sleep', detail: 'Rest and daily routines', icon: 'moon-outline' },
  { kind: 'vet', title: 'Vet visits', detail: 'Appointments and care notes', icon: 'medical-outline' },
];

function startingSpecies(value: string): (typeof speciesOptions)[number] {
  if (!value.trim() || value.toLowerCase() === 'dog') return 'Dog';
  return value.toLowerCase() === 'cat' ? 'Cat' : 'Other';
}

export function OnboardingScreen({ ownerName, mode, initialPet, initialAvatar, previewConnection, facebookSignInRequired = false, onPickPhoto, onGenerateAvatar, onComplete, onSignOut }: OnboardingScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [step, setStep] = useState<SetupStep>(0);
  const [name, setName] = useState(initialPet.name);
  const [species, setSpecies] = useState<(typeof speciesOptions)[number]>(() => startingSpecies(initialPet.species));
  const [breed, setBreed] = useState(initialPet.breed);
  const [age, setAge] = useState(initialPet.age);
  const [goals, setGoals] = useState<CareKind[]>(['feeding', 'walk']);
  const [photo, setPhoto] = useState<PetPhoto | null>(null);
  const [avatar, setAvatar] = useState<PetAvatar | undefined>(initialAvatar);
  const [photoPreviewFailed, setPhotoPreviewFailed] = useState(false);
  const [photoSettings, setPhotoSettings] = useState(false);
  const [pending, setPending] = useState<'camera' | 'library' | 'generate' | 'connect' | 'save' | 'signout' | null>(null);
  const [error, setError] = useState('');
  const [museHelp, setMuseHelp] = useState(false);
  const operationInFlight = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const busy = pending !== null;
  const guidedPreview = PUBLIC_DEMO_ONLY || facebookSignInRequired;
  const petName = name.trim();
  const selectedCare = careOptions.filter(option => goals.includes(option.kind));
  const museGuidance = [
    { prompt: 'Hi, I’m Muse Pet. First, tell me who we’re caring for. A name is enough to get started.', why: 'Your pet’s name keeps their care page personal. Breed and age are optional; they help tailor later guidance. You can edit these details in Settings.' },
    { prompt: 'Next, give your companion a familiar face. You can also skip this and keep exploring with me.', why: 'A photo is optional. Custom avatar generation needs a live Muse connection, and a photo is only sent when you choose to create an avatar. Skipping keeps the Muse guide available.' },
    { prompt: 'What would you like a little help with? Choose the care areas that matter to you.', why: 'These choices set your care focus. They do not invent a routine or create records. You’ll record meals, walks and appointments yourself, with Muse to help.' },
    { prompt: 'Let’s check your choices together. When you’re ready, I’ll guide you through your first care moment.', why: 'Saving creates this pet’s care page. In the demo, the page stays in this browser. You can review and edit it later; nothing is posted or purchased.' },
  ][step];

  function draftPet(): PetProfile {
    return { ...initialPet, name: petName, species, breed: breed.trim(), age: age.trim() };
  }

  function goTo(next: SetupStep) {
    if (operationInFlight.current) return;
    Keyboard.dismiss();
    setError('');
    setPhotoSettings(false);
    setStep(next);
    setMuseHelp(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  function continueSetup() {
    if (operationInFlight.current) return;
    if (!petName) {
      setError('Add your pet’s name to continue.');
      return;
    }
    if (step === 0) goTo(1);
    else if (step === 1) goTo(2);
    else if (!goals.length) setError('Choose at least one care area to continue.');
    else goTo(3);
  }

  function toggleGoal(kind: CareKind) {
    if (operationInFlight.current) return;
    setError('');
    setPhotoSettings(false);
    setGoals(current => current.includes(kind) ? current.filter(value => value !== kind) : [...current, kind]);
  }

  async function connectPreview(address: string, token: string) {
    if (operationInFlight.current || !previewConnection) throw new Error('Please wait for the current preview step.');
    operationInFlight.current = true;
    setPending('connect');
    setError('');
    setPhotoSettings(false);
    try {
      return await previewConnection.onConnect(address, token);
    } finally {
      operationInFlight.current = false;
      setPending(null);
    }
  }

  async function pickPhoto(source: 'camera' | 'library') {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    setPending(source);
    setError('');
    setPhotoSettings(false);
    try {
      const selected = await onPickPhoto(source);
      if (selected) {
        setPhoto(selected);
        setAvatar(undefined);
        setPhotoPreviewFailed(false);
      }
    } catch (failure) {
      setPhotoSettings(petPhotoNeedsSettings(failure));
      setError(failure instanceof Error ? failure.message : 'We couldn’t open your photo. Please try again or choose another photo.');
    } finally {
      operationInFlight.current = false;
      setPending(null);
    }
  }

  async function generateAvatar() {
    if (operationInFlight.current || !photo || photoPreviewFailed) return;
    operationInFlight.current = true;
    setPending('generate');
    setError('');
    setPhotoSettings(false);
    try {
      const created = await onGenerateAvatar(photo, draftPet());
      if (!created || typeof created.uri !== 'string' || !created.uri.trim()) throw new Error('No avatar image was returned. Please try again.');
      setAvatar(created);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Your Muse avatar couldn’t be created. Try again, choose another photo, or continue without an avatar.');
    } finally {
      operationInFlight.current = false;
      setPending(null);
    }
  }

  function skipAvatar() {
    if (operationInFlight.current) return;
    setAvatar(undefined);
    goTo(2);
  }

  function avatarImageFailed() {
    setAvatar(undefined);
    setError('The avatar image couldn’t be displayed. Try creating it again or continue without an avatar.');
  }

  async function finishSetup() {
    if (operationInFlight.current) return;
    if (!petName || !goals.length) {
      setError('Add a pet name and choose at least one care area before saving.');
      return;
    }
    operationInFlight.current = true;
    setPending('save');
    setError('');
    setPhotoSettings(false);
    Keyboard.dismiss();
    try {
      await onComplete(
        draftPet(),
        selectedCare.map(option => option.kind),
        avatar,
      );
    } catch {
      setError('Your setup could not be saved. Your details are still here. Please try again.');
    } finally {
      operationInFlight.current = false;
      setPending(null);
    }
  }

  async function leaveSession() {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    setPending('signout');
    setError('');
    setPhotoSettings(false);
    Keyboard.dismiss();
    try {
      await onSignOut();
    } catch {
      setError('We couldn’t leave this session. Please try again.');
    } finally {
      operationInFlight.current = false;
      setPending(null);
    }
  }

  return <View style={styles.root}>
    <BrandHeader />
    <ScrollView ref={scroll} style={styles.root} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.sessionRow}>
        <View style={styles.modeBadge}>
          <Icon name={mode === 'facebook' ? 'logo-facebook' : 'sparkles-outline'} size={15} color={colors.blue} />
          <Text style={styles.modeLabel}>{mode === 'facebook' ? 'Facebook signed in' : 'Demo preview'}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }}
          disabled={busy} onPress={() => void leaveSession()}
          style={({ pressed }) => [styles.sessionButton, pressed && styles.pressed, busy && styles.disabled]}>
          <Text style={styles.sessionLabel}>{pending === 'signout' ? 'Leaving…' : mode === 'facebook' ? 'Switch account' : 'Leave preview'}</Text>
        </Pressable>
      </View>

      <View accessible accessibilityLabel={`Setup step ${step + 1} of 4`} style={styles.progress}>
        <Text style={styles.stepLabel}>STEP {step + 1} OF 4</Text>
        <View style={styles.progressTrack}>
          {[0, 1, 2, 3].map(index => <View key={index} style={[styles.progressSegment, index <= step && styles.progressActive]} />)}
        </View>
      </View>

      <View style={{ padding: 17, gap: 11, borderRadius: 20, backgroundColor: colors.violetWash, borderWidth: 1, borderColor: colors.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="sparkles-outline" color={colors.violet} size={20} /><Text style={{ color: colors.violet, fontSize: 12, fontWeight: '700' }}>MUSE PET · YOUR GUIDE</Text></View>
        <Text accessibilityLiveRegion="polite" style={styles.body}>{museGuidance.prompt}</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: museHelp, disabled: busy }} disabled={busy} onPress={() => setMuseHelp(value => !value)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={{ color: colors.violet, fontWeight: '700', fontSize: 13 }}>{museHelp ? 'Hide explanation' : 'Why this step?'}</Text><Icon name={museHelp ? 'chevron-up' : 'chevron-down'} color={colors.violet} size={17} /></Pressable>
        {museHelp ? <Text accessibilityLiveRegion="polite" style={styles.body}>{museGuidance.why}</Text> : null}
      </View>

      {step === 0 ? <View style={styles.content} pointerEvents={busy ? 'none' : 'auto'}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>{ownerName.trim() ? `Hi, ${ownerName.trim()}` : 'Welcome to Meta Pet'}</Text>
          <Text accessibilityRole="header" style={styles.title}>Tell us about your pet</Text>
          <Text style={styles.body}>{mode === 'facebook'
            ? 'Your Facebook sign-in belongs to you. Create your pet’s own profile here, then bring them to life as a Muse avatar.'
            : 'Create your pet’s own profile, then bring them to life as a Muse avatar.'}</Text>
        </View>
        <Field label="Pet name (required)" value={name} placeholder="What do you call them?" maxLength={50}
          onChange={value => { if (!operationInFlight.current) { setName(value); setError(''); } }} />
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Pet type</Text>
          <View style={styles.speciesRow}>
            {speciesOptions.map(option => <Pressable key={option} accessibilityRole="button"
              accessibilityLabel={option} accessibilityState={{ selected: species === option, disabled: busy }}
              disabled={busy} onPress={() => setSpecies(option)}
              style={({ pressed }) => [styles.speciesButton, species === option && styles.speciesSelected, pressed && styles.pressed]}>
              <Icon name={option === 'Other' ? 'heart-outline' : 'paw-outline'} size={20} color={species === option ? colors.blue : colors.slate} />
              <Text style={[styles.speciesLabel, species === option && styles.selectedLabel]}>{option}</Text>
            </Pressable>)}
          </View>
        </View>
        <Field label="Breed (optional)" value={breed} placeholder="Breed or mix" maxLength={80}
          onChange={value => { if (!operationInFlight.current) setBreed(value); }} />
        <Field label="Age (optional)" value={age} placeholder="For example, 2 years" maxLength={40}
          onChange={value => { if (!operationInFlight.current) setAge(value); }} />
      </View> : step === 1 ? <View style={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>A little photo. A little magic.</Text>
          <Text accessibilityRole="header" style={styles.title}>{guidedPreview ? 'Meet your Muse guide' : <>Create {petName}’s Muse</>}</Text>
          <Text style={styles.body}>{facebookSignInRequired ? 'You can preview a photo on this device and continue with your Muse guide. Sign in with Facebook for live Muse and custom avatar creation.' : PUBLIC_DEMO_ONLY ? 'Muse can guide you now. You can preview a photo on this device, or continue with the companion below. AI avatar generation is not connected in this demo.' : 'Take or upload a clear photo to turn their familiar face and markings into a soft Muse-style avatar.'}</Text>
        </View>
        {mode === 'demo' && previewConnection ? <OnboardingMuseConnection initialUrl={previewConnection.initialUrl}
          initialToken={previewConnection.initialToken} disabled={busy} onConnect={connectPreview} /> : null}
        {facebookSignInRequired ? <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.goalTitle}>Continue with Facebook for live Muse</Text>
          <Text style={styles.body}>Keep exploring with the local guide, or return to sign-in for live Muse and account memory. Returning leaves this unsaved setup; your previously saved demo stays on this device.</Text>
          <ActionButton label="Go to Facebook sign-in" icon="logo-facebook" disabled={busy} onPress={() => void leaveSession()} />
        </View> : null}
        <View style={styles.photoStudio}>
          <View style={styles.previewColumn}>
            <Text style={styles.previewLabel}>YOUR PHOTO</Text>
            <View style={styles.photoFrame}>
              {photo && !photoPreviewFailed ? <Image accessible source={{ uri: photo.uri }} style={styles.previewImage} resizeMode="cover"
                accessibilityLabel={`Selected source photo of ${petName}`}
                onError={() => { setPhotoPreviewFailed(true); setError('This photo couldn’t be displayed. Please take or choose another photo.'); }} />
                : <View style={styles.photoPlaceholder}>
                  <Icon name="camera-outline" size={32} color={colors.blue} />
                  <Text style={styles.placeholderTitle}>{photoPreviewFailed ? 'Choose another photo' : 'Their best side'}</Text>
                  <Text style={styles.placeholderDetail}>One pet, good light</Text>
                </View>}
            </View>
          </View>
          <View style={styles.previewColumn}>
            <Text style={[styles.previewLabel, styles.violetLabel]}>MUSE AVATAR</Text>
            <View style={[styles.photoFrame, styles.avatarFrame]}>
              {guidedPreview && !avatar ? <MuseDog style={styles.previewImage} /> : pending === 'generate' ? <View accessible accessibilityRole="progressbar"
                accessibilityLabel="Creating your custom Muse avatar" accessibilityState={{ busy: true }} style={styles.photoPlaceholder}>
                <ActivityIndicator size="large" color={colors.violet} />
                <Text style={styles.placeholderTitle}>Creating Muse…</Text>
                <Text style={styles.placeholderDetail}>Making it their own</Text>
              </View> : avatar ? <Image accessible source={{ uri: avatar.uri }} style={styles.previewImage} resizeMode="contain"
                accessibilityLabel={`${petName}’s generated Muse avatar`} onError={avatarImageFailed} />
                : <View style={styles.photoPlaceholder}>
                  <Icon name="sparkles-outline" size={32} color={colors.violet} />
                  <Text style={styles.placeholderTitle}>Their Muse moment</Text>
                  <Text style={styles.placeholderDetail}>{photo ? 'Ready to create' : 'Add a photo first'}</Text>
                </View>}
            </View>
          </View>
        </View>
        <View style={styles.photoControls}>
          <Pressable accessibilityRole="button" accessibilityLabel={photo ? 'Retake pet photo with camera' : 'Take pet photo with camera'}
            accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void pickPhoto('camera')}
            style={({ pressed }) => [styles.photoButton, pressed && styles.pressed, busy && styles.disabled]}>
            <Icon name="camera-outline" color={colors.blue} size={21} />
            <Text style={styles.photoButtonLabel}>{pending === 'camera' ? 'Opening…' : photo ? 'Retake photo' : 'Take photo'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose pet photo from gallery"
            accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void pickPhoto('library')}
            style={({ pressed }) => [styles.photoButton, pressed && styles.pressed, busy && styles.disabled]}>
            <Icon name="images-outline" color={colors.blue} size={21} />
            <Text style={styles.photoButtonLabel}>{pending === 'library' ? 'Opening…' : 'Upload photo'}</Text>
          </Pressable>
        </View>
        {avatar && pending !== 'generate' ? <View accessibilityRole="text" accessibilityLiveRegion="polite" style={styles.avatarReady}>
          <Icon name="checkmark-circle" color={colors.blue} size={20} />
          <Text style={styles.avatarReadyLabel}>Your custom Muse avatar is ready.</Text>
        </View> : null}
        <Text style={styles.hint}>{guidedPreview ? 'Photo previews stay on this device and are not sent for generation while using the local guide.' : 'Creating an avatar sends this photo and your pet’s details to the AI avatar service. Your Facebook profile photo is never used.'}</Text>
        {avatar && photo && !guidedPreview ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy}
          onPress={() => void generateAvatar()} style={({ pressed }) => [styles.textButton, pressed && styles.pressed, busy && styles.disabled]}>
          <Icon name="refresh-outline" color={colors.violet} size={18} />
          <Text style={styles.retryLabel}>Create another version</Text>
        </Pressable> : null}
      </View> : step === 2 ? <View style={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>Care, your way</Text>
          <Text accessibilityRole="header" style={styles.title}>What matters for {petName}?</Text>
          <Text style={styles.body}>Choose the care areas you’d like to focus on. Pick at least one.</Text>
        </View>
        <View style={styles.goalList}>
          {careOptions.map(option => {
            const selected = goals.includes(option.kind);
            return <Pressable key={option.kind} accessibilityRole="checkbox"
              accessibilityLabel={`${option.title}. ${option.detail}`}
              accessibilityState={{ checked: selected, disabled: busy }} disabled={busy}
              onPress={() => toggleGoal(option.kind)}
              style={({ pressed }) => [styles.goalCard, selected && styles.goalSelected, pressed && styles.pressed, busy && styles.disabled]}>
              <View style={[styles.goalIcon, selected && styles.goalIconSelected]}>
                <Icon name={option.icon} color={selected ? colors.blue : colors.slate} size={23} />
              </View>
              <View style={styles.goalCopy}>
                <Text style={styles.goalTitle}>{option.title}</Text>
                <Text style={styles.goalDetail}>{option.detail}</Text>
              </View>
              <Icon name={selected ? 'checkmark-circle' : 'ellipse-outline'} color={selected ? colors.blue : colors.disabledIcon} size={25} />
            </Pressable>;
          })}
        </View>
        <Text style={styles.hint}>You’ll add care records and appointments as you go.</Text>
      </View> : <View style={styles.content}>
        <View style={styles.readyHero}>
          {avatar ? <Image accessible source={{ uri: avatar.uri }} style={styles.reviewAvatar} resizeMode="contain"
            accessibilityLabel={`${petName}’s custom Muse avatar`} onError={avatarImageFailed} />
            : <MuseDog style={styles.mascot} />}
          <Text style={styles.eyebrow}>{avatar ? 'Your custom Muse avatar' : 'Kai, your Muse guide'}</Text>
          <Text accessibilityRole="header" style={[styles.title, styles.centerText]}>Your pet’s companion</Text>
          <Text style={[styles.body, styles.centerText]}>{avatar
            ? `Inspired by ${petName}. Ready for everyday care together.`
            : 'No custom avatar selected. Kai can guide you as you start caring.'}</Text>
        </View>
        {!avatar ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy}
          onPress={() => goTo(1)} style={({ pressed }) => [styles.textButton, pressed && styles.pressed, busy && styles.disabled]}>
          <Icon name="camera-outline" color={colors.blue} size={19} />
          <Text style={styles.photoButtonLabel}>Back to photo and avatar</Text>
        </Pressable> : null}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeading}>
            <View style={styles.summaryIcon}><Icon name="paw-outline" color={colors.blue} /></View>
            <View style={styles.goalCopy}>
              <Text style={styles.summaryName}>{petName}</Text>
              <Text style={styles.goalDetail}>{[species, breed.trim(), age.trim()].filter(Boolean).join(' · ')}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <Text style={styles.fieldLabel}>Your care focus</Text>
          <View style={styles.summaryGoals}>
            {selectedCare.map(option => <View key={option.kind} style={styles.summaryGoal}>
              <Icon name={option.icon} size={15} color={colors.blue} />
              <Text style={styles.summaryGoalLabel}>{option.title}</Text>
            </View>)}
          </View>
        </View>
        <View style={styles.collarCard}>
          <View style={styles.collarIcon}><Icon name="bluetooth-outline" color={colors.violet} size={24} /></View>
          <View style={styles.goalCopy}>
            <Text style={styles.goalTitle}>No collar connected</Text>
            <Text style={styles.goalDetail}>A collar is optional. Start with care notes and Muse, and explore compatible hardware later.</Text>
          </View>
        </View>
      </View>}

      {error ? <><FormNote error>{error}</FormNote>{photoSettings && step === 1 && <ActionButton label="Open phone settings" icon="settings-outline" disabled={busy}
        onPress={() => { void openPetPhotoSettings().catch(() => setError('Phone settings could not open. Open your phone’s Settings app and allow camera or photo access for Meta Pet.')); }} />}</> : null}

      <View style={styles.actions}>
        {step === 1 ? <>
          {guidedPreview && !avatar ? <ActionButton label="Continue with Muse guide" icon="arrow-forward" disabled={busy} onPress={skipAvatar} /> : avatar ? <ActionButton label={pending === 'generate' ? 'Creating your Muse…' : 'Continue with this avatar'} icon="arrow-forward" disabled={busy} onPress={continueSetup} />
            : <ActionButton label={pending === 'generate' ? 'Creating your Muse…' : 'Generate Muse avatar'} icon="sparkles-outline"
              disabled={busy || !photo || photoPreviewFailed} onPress={() => void generateAvatar()} />}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={skipAvatar}
            style={({ pressed }) => [styles.textButton, pressed && styles.pressed, busy && styles.disabled]}>
            <Text style={styles.skipLabel}>{photo || avatar ? 'Continue without an avatar' : 'Skip photo for now'}</Text>
          </Pressable>
        </> : <ActionButton label={pending === 'save' ? 'Saving your setup…' : step === 3 ? 'Start caring' : step === 2 ? (avatar ? 'Review my pet’s Muse' : 'Review pet setup') : 'Continue to photo'}
          icon={step === 3 ? 'heart-outline' : 'arrow-forward'} disabled={busy}
          onPress={step === 3 ? () => void finishSetup() : continueSetup} />}
        {step > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Back to previous setup step"
          accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => goTo((step - 1) as SetupStep)}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed, busy && styles.disabled]}>
          <Icon name="arrow-back" size={18} color={colors.slate} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable> : <Text style={styles.footerNote}>A few small details. A lot of care.</Text>}
      </View>
    </ScrollView>
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cloud },
  page: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40, gap: 24 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 8 },
  modeBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.blueWash, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
  modeLabel: { color: colors.blue, fontSize: 11, fontWeight: '700' },
  sessionButton: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  sessionLabel: { color: colors.slate, fontSize: 12, fontWeight: '600' },
  progress: { gap: 10 },
  stepLabel: { color: colors.slate, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  progressTrack: { flexDirection: 'row', gap: 6 },
  progressSegment: { flex: 1, height: 4, borderRadius: 4, backgroundColor: colors.line },
  progressActive: { backgroundColor: colors.blue },
  content: { gap: 22 },
  heading: { gap: 10, marginBottom: 2 },
  eyebrow: { color: colors.blue, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  title: { color: colors.navy, fontSize: 29, lineHeight: 35, fontWeight: '800', letterSpacing: -0.8 },
  body: { color: colors.slate, fontSize: 14, lineHeight: 22 },
  fieldGroup: { gap: 10 },
  fieldLabel: { color: colors.navy, fontSize: 13, fontWeight: '700' },
  speciesRow: { flexDirection: 'row', gap: 9 },
  speciesButton: { flex: 1, minHeight: 64, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 8, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', gap: 5 },
  speciesSelected: { borderColor: colors.blue, backgroundColor: colors.blueWash },
  speciesLabel: { color: colors.slate, fontSize: 13, fontWeight: '700' },
  selectedLabel: { color: colors.blue },
  goalList: { gap: 11 },
  goalCard: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 15, backgroundColor: colors.surface },
  goalSelected: { borderColor: colors.blue, backgroundColor: colors.blueWash },
  goalIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cloud },
  goalIconSelected: { backgroundColor: colors.surface },
  goalCopy: { flex: 1, gap: 4 },
  goalTitle: { color: colors.navy, fontSize: 15, fontWeight: '700' },
  goalDetail: { color: colors.slate, fontSize: 12, lineHeight: 18 },
  hint: { color: colors.slate, fontSize: 12, lineHeight: 19 },
  photoStudio: { flexDirection: 'row', gap: 12 },
  previewColumn: { flex: 1, minWidth: 0, gap: 11 },
  previewLabel: { color: colors.blue, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  violetLabel: { color: colors.violet },
  photoFrame: { width: '100%', aspectRatio: 1, backgroundColor: colors.blueWash, borderWidth: 1, borderColor: colors.line, borderRadius: 23, overflow: 'hidden' },
  avatarFrame: { backgroundColor: colors.violetWash },
  previewImage: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, gap: 9 },
  placeholderTitle: { color: colors.navy, fontSize: 12, lineHeight: 17, fontWeight: '700', textAlign: 'center' },
  placeholderDetail: { color: colors.slate, fontSize: 10, lineHeight: 15, textAlign: 'center' },
  photoControls: { flexDirection: 'row', gap: 10 },
  photoButton: { flex: 1, minHeight: 58, paddingVertical: 13, paddingHorizontal: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 16 },
  photoButtonLabel: { color: colors.blue, fontSize: 13, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
  avatarReady: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.mintWash, borderRadius: 14, padding: 14 },
  avatarReadyLabel: { color: colors.navy, fontSize: 13, lineHeight: 19, fontWeight: '700', flex: 1 },
  textButton: { minHeight: 48, paddingHorizontal: 8, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  retryLabel: { color: colors.violet, fontSize: 13, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
  skipLabel: { color: colors.slate, fontSize: 13, lineHeight: 19, textAlign: 'center', textDecorationLine: 'underline' },
  readyHero: { alignItems: 'center', backgroundColor: colors.violetWash, borderRadius: 28, paddingHorizontal: 22, paddingBottom: 26, gap: 10, overflow: 'hidden' },
  mascot: { width: 190, height: 190, marginBottom: -10 },
  reviewAvatar: { width: 224, height: 224, maxWidth: '100%', marginTop: 16, borderRadius: 34 },
  centerText: { textAlign: 'center' },
  summaryCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 22, padding: 20, gap: 15 },
  summaryHeading: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  summaryIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blueWash },
  summaryName: { color: colors.navy, fontSize: 20, fontWeight: '800' },
  divider: { height: 1, backgroundColor: colors.line },
  summaryGoals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryGoal: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 9, backgroundColor: colors.blueWash },
  summaryGoalLabel: { color: colors.blue, fontSize: 11, fontWeight: '700' },
  collarCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  collarIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violetWash },
  actions: { gap: 10, marginTop: 2 },
  backButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  backLabel: { color: colors.slate, fontSize: 14, fontWeight: '700' },
  footerNote: { color: colors.slate, fontSize: 11, lineHeight: 18, textAlign: 'center', paddingTop: 3 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
});
