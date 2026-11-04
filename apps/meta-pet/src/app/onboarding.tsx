import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { PUBLIC_DEMO_ONLY } from '../demoMode';
import { AUTH_BASE_URL } from '../auth-client';
import { useCare } from '../CareContext';
import { connectOnboardingMuse, onboardingPreviewMode } from '../onboardingConnection';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { pickPetPhoto } from '../petPhoto';
import { usePetAvatar } from '../usePetAvatar';

export default function OnboardingRoute() {
  const { owner, signOut } = useAuth();
  const { data, completeOnboarding, setConnection, clientToken, getMuseSession } = useCare();
  const generateAvatar = usePetAvatar();
  const previewMode = onboardingPreviewMode(AUTH_BASE_URL, PUBLIC_DEMO_ONLY);
  const ownerKey = owner ? `${owner.mode}:${owner.id}` : null;
  const activeOwner = useRef(ownerKey);
  useEffect(() => {
    activeOwner.current = ownerKey;
    return () => { activeOwner.current = null; };
  }, [ownerKey]);
  const connectPreview = useCallback((address: string, token: string) => connectOnboardingMuse({
    address, token, activate: setConnection, getSession: getMuseSession,
    isCurrentOwner: () => owner?.mode === 'demo' && activeOwner.current === ownerKey,
  }), [owner?.mode, ownerKey, setConnection, getMuseSession]);
  if (!owner) return null;
  return <OnboardingScreen key={ownerKey} ownerName={owner.name} mode={owner.mode} initialPet={data.pet} initialAvatar={data.pet.avatar}
    onPickPhoto={pickPetPhoto} onGenerateAvatar={generateAvatar}
    previewConnection={previewMode === 'development' && owner.mode === 'demo' ? { initialUrl: data.backendUrl || AUTH_BASE_URL, initialToken: clientToken, onConnect: connectPreview } : undefined}
    facebookSignInRequired={previewMode === 'facebook' && owner.mode === 'demo'}
    onComplete={(pet, goals, avatar) => completeOnboarding({ ...pet, avatar }, goals)} onSignOut={signOut} />;
}
