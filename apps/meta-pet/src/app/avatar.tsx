import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useCare } from '../CareContext';
import { FormNote, FormPage, FormTitle } from '../components/forms';
import { ActionButton } from '../components/ui';
import { PetMuseAvatar } from '../components/PetMuseAvatar';
import { openPetPhotoSettings, petPhotoNeedsSettings, pickPetPhoto } from '../petPhoto';
import { usePetAvatar } from '../usePetAvatar';
import { useTheme } from '../ThemeContext';
import type { PetAvatar, PetPhoto } from '../types';

export default function PetAvatarRoute() {
  const { data, updatePet, getMuseSession } = useCare();
  const { colors } = useTheme();
  const generate = usePetAvatar();
  const [photo, setPhoto] = useState<PetPhoto | null>(null);
  const [avatar, setAvatar] = useState<PetAvatar | undefined>(data.pet.avatar);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [photoSettings, setPhotoSettings] = useState(false);
  const busy = useRef(false);
  async function work(kind: 'camera' | 'library' | 'generate' | 'save') {
    if (busy.current) return;
    busy.current = true; setPending(kind); setError(''); setPhotoSettings(false);
    const session = getMuseSession();
    try {
      if (kind === 'camera' || kind === 'library') {
        const selected = await pickPetPhoto(kind);
        if (session !== getMuseSession()) throw new Error('Your care profile changed. Please try again.');
        if (selected) { setPhoto(selected); setAvatar(undefined); }
      } else if (kind === 'generate' && photo) setAvatar(await generate(photo, data.pet));
      else if (kind === 'save' && avatar) {
        await updatePet({ ...data.pet, avatar });
        router.replace('/');
      }
    } catch (failure) { setPhotoSettings(petPhotoNeedsSettings(failure)); setError(failure instanceof Error ? failure.message : 'Your avatar could not be created. Please try again.'); }
    finally { busy.current = false; setPending(''); }
  }
  return <FormPage>
    <FormTitle title={`${data.pet.name}, meet Muse.`} body="Turn a clear pet photo into a custom plush companion, with their own ears, markings and personality." />
    <View style={{ borderRadius: 26, padding: 15, backgroundColor: colors.violetWash, alignItems: 'center', gap: 10 }}>
      {avatar ? <PetMuseAvatar avatar={avatar} style={{ width: 240, height: 240 }} /> : photo ? <Image source={{ uri: photo.uri }} accessibilityLabel="Selected pet photo" contentFit="contain" style={{ width: 240, height: 240 }} /> : <PetMuseAvatar style={{ width: 240, height: 240 }} />}
      <Text style={{ color: colors.slate, fontSize: 12 }}>{avatar ? 'Your custom Muse avatar' : photo ? 'Your selected photo' : 'Kai is an example. Your avatar will come from your photo.'}</Text>
    </View>
    <ActionButton label="Take a pet photo" icon="camera-outline" disabled={!!pending} onPress={() => void work('camera')} />
    <ActionButton label="Choose a photo" icon="images-outline" tone="violet" disabled={!!pending} onPress={() => void work('library')} />
    <FormNote>Choose a photo you have permission to use. When you create the avatar, the selected photo is sent to Meta AI. The original photo is not saved in your pet profile or posted to social media.</FormNote>
    {photo && <ActionButton label={pending === 'generate' ? 'Creating your Muse avatar…' : avatar ? 'Create another version' : 'Create Muse avatar'} icon="sparkles-outline" disabled={!!pending} onPress={() => void work('generate')} />}
    {pending === 'generate' && <FormNote>This can take a minute or two. Keep this screen open.</FormNote>}
    {avatar && <ActionButton label={pending === 'save' ? 'Saving…' : 'Use this avatar'} icon="checkmark-circle-outline" disabled={!!pending} onPress={() => void work('save')} />}
    {!!error && <FormNote error>{error}</FormNote>}
    {!!error && photoSettings && <ActionButton label="Open phone settings" icon="settings-outline" disabled={!!pending}
      onPress={() => { void openPetPhotoSettings().catch(() => setError('Phone settings could not open. Open your phone’s Settings app and allow camera or photo access for Meta Pet.')); }} />}
  </FormPage>;
}
