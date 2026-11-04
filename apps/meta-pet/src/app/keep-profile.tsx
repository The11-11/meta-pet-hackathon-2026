import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useCare } from '../CareContext';
import { FormPage, FormNote } from '../components/forms';
import { KeepDemoProfile } from '../components/KeepDemoProfile';

export default function KeepProfileRoute() {
  const { owner } = useAuth();
  const { data, profileHandoff, keepDemoProfile, dismissProfileHandoff } = useCare();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function choose(keep: boolean) {
    if (busy) return;
    setBusy(true); setError('');
    try { if (keep) await keepDemoProfile(); else await dismissProfileHandoff(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Your choice could not be saved. Please retry.'); }
    finally { setBusy(false); }
  }
  if (!profileHandoff || owner?.mode !== 'facebook') return <FormPage><FormNote>This profile choice is no longer available. Open your current care profile.</FormNote></FormPage>;
  const occupied = Boolean(data.pet.name.trim() || data.onboarding?.completed || data.logs.length || data.appointments.length || data.rewards.length || data.muse || data.social?.profiles.length || data.social?.posts.length);
  return <FormPage><KeepDemoProfile pet={{ id: data.pet.id, ...profileHandoff.profile }} goals={profileHandoff.goals} accountName={owner.name}
    existingPetName={occupied ? data.pet.name.trim() || 'a pet profile' : undefined} busy={busy} error={error}
    onKeep={() => void choose(true)} onSkip={() => void choose(false)} /></FormPage>;
}
