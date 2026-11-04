import { useCallback } from 'react';
import { PUBLIC_DEMO_ONLY } from './demoMode';
import { useAuth } from './AuthContext';
import { useCare } from './CareContext';
import { AUTH_BASE_URL } from './auth-client';
import { requestPetAvatar } from './petAvatarApi';
import { compactPetAvatar } from './petPhoto';
import type { PetPhoto, PetProfile } from './types';

export function usePetAvatar() {
  const { getMuseTransport } = useAuth();
  const { data, clientToken, getMuseSession } = useCare();
  return useCallback(async (photo: PetPhoto, pet: PetProfile) => {
    if (PUBLIC_DEMO_ONLY) throw new Error('AI avatar generation is not connected in this guided demo. Continue with your Muse guide.');
    const session = getMuseSession();
    const url = data.backendUrl || AUTH_BASE_URL;
    const transport = await getMuseTransport(url);
    if (session !== getMuseSession()) throw new Error('Your care profile changed. Please try again.');
    const generated = await requestPetAvatar(url, photo, pet, clientToken, transport);
    const avatar = await compactPetAvatar(generated);
    if (session !== getMuseSession()) throw new Error('Your care profile changed. Please create an avatar for the current pet.');
    return avatar;
  }, [data.backendUrl, clientToken, getMuseTransport, getMuseSession]);
}
