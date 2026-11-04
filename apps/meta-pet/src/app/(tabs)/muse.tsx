import { router } from 'expo-router';
import MuseScreen from '../../screens/MuseScreen';
export default function MuseRoute() { return <MuseScreen onOpenCollar={() => router.push('/collar')} onOpenSettings={() => router.push('/settings')} />; }
