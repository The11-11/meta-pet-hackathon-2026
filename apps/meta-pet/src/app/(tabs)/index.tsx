import { router } from 'expo-router';
import { useCare } from '../../CareContext';
import { CareScreen } from '../../screens/CareScreen';

export default function CareRoute() {
  const { data } = useCare();
  return <CareScreen backendUrl={data.backendUrl} pet={data.pet} logs={data.logs} appointments={data.appointments} goals={data.onboarding?.goals}
    onLog={type => router.push({ pathname: '/entry', params: { kind: type } })}
    onOpenMuse={() => router.push('/muse')} onOpenCollar={() => router.push('/collar')}
    onAddAppointment={() => router.push('/appointment')} onEditPet={() => router.push('/settings')} />;
}
