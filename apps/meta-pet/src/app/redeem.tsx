import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { useCare } from '../CareContext';
import { ActionButton } from '../components/ui';
import { ProductVisual } from '../components/ProductVisual';
import { FormNote, FormPage, FormTitle } from '../components/forms';
import { products } from '../data';
import { useTheme } from '../ThemeContext';

export default function RedeemRoute() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const product = products.find(item => item.id === id);
  const { data, redeem } = useCare();
  const [status, setStatus] = useState<'pending' | 'success' | 'insufficient'>('pending');
  const balance = data.rewards.reduce((sum, item) => sum + item.amount, 0);
  if (!product) return <FormPage><FormTitle title="Product not found" /><ActionButton label="Back to shop" onPress={() => router.replace('/shop')} /></FormPage>;
  return <FormPage><ProductVisual product={product} detail /><FormTitle title={status === 'success' ? 'Demo redemption recorded.' : product.name} body={product.detail} /><Text style={{ color: colors.navy, fontSize: 34, fontWeight: '800' }}>{product.points} demo credits</Text><FormNote>No product is ordered or delivered. No money or cryptocurrency is transferred. This only updates the local Peta Coin demo ledger.</FormNote><Text style={{ color: colors.slate }}>Available balance: {balance} demo credits</Text>{status === 'insufficient' && <FormNote error>You do not have enough demo credits for this redemption.</FormNote>}{status === 'success' ? <ActionButton label="View Peta Coin activity" onPress={() => router.replace('/rewards')} icon="gift-outline" /> : <ActionButton label="Confirm demo redemption" disabled={balance < product.points} onPress={() => setStatus(redeem(product) ? 'success' : 'insufficient')} icon="checkmark" />}<ActionButton label="Back to shop" tone="navy" onPress={() => router.replace('/shop')} /></FormPage>;
}
