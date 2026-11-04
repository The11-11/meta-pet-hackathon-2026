import { useAuth } from '../AuthContext';
import { useCare } from '../CareContext';
import { FormPage } from '../components/forms';
import { MuseMemory } from '../components/MuseMemory';

export default function MemoryRoute() {
  const { owner } = useAuth();
  const { data } = useCare();
  const scope = JSON.stringify([owner?.mode ?? 'signed-out', owner?.id ?? '', data.pet.id, data.backendUrl]);
  return <FormPage><MuseMemory key={scope} ownerScope={scope} petId={data.pet.id} petName={data.pet.name || 'your pet'} /></FormPage>;
}
