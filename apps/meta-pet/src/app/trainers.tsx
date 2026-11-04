import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '../AuthContext';
import { FormPage } from '../components/forms';
import { TrainerFinder } from '../components/TrainerFinder';

export default function TrainersRoute() {
  const { owner } = useAuth();
  const { error } = useLocalSearchParams<{ error?: string }>();
  const ownerScope = owner ? owner.mode + ':' + owner.id : 'signed-out';
  return <FormPage><TrainerFinder key={ownerScope} ownerScope={ownerScope} facebookReturnError={Boolean(error)} /></FormPage>;
}
