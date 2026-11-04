import { router } from 'expo-router';
import { useCare } from '../../CareContext';
import { RewardsScreen } from '../../screens/RewardsScreen';
export default function RewardsRoute() { const { data } = useCare(); return <RewardsScreen entries={data.rewards} onOpenShop={() => router.push('/shop')} />; }
