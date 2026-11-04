import { router } from 'expo-router';
import { useCare } from '../../CareContext';
import { ShopScreen } from '../../screens/ShopScreen';
export default function ShopRoute() {
  const { data } = useCare();
  return <ShopScreen balance={data.rewards.reduce((sum, item) => sum + item.amount, 0)} onRedeem={product => router.push({ pathname: '/redeem', params: { id: product.id } })} />;
}
