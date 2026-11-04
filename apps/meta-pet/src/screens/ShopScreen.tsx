import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import type { ThemeColors } from '../theme';
import { useTheme } from '../ThemeContext';
import { products } from '../data';
import { MarketplaceDiscovery } from '../components/MarketplaceDiscovery';
import { ProductVisual } from '../components/ProductVisual';
import type { Product } from '../types';
import { ActionButton, Icon, ScreenHeader } from '../components/ui';

type Props = { onRedeem: (product: Product) => void; balance: number };

export function ShopScreen({ onRedeem, balance }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <ScreenHeader eyebrow="Meta Pet Shop" title="Made for their world." subtitle="Find everyday supplies and explore the future of connected care." />
    <MarketplaceDiscovery />
    <View style={styles.previewBanner}><Icon name="cube-outline" color={colors.blue} size={22} /><View style={styles.flex}><Text style={styles.bannerTitle}>Concept shop</Text><Text style={styles.bannerBody}>Try a demo redemption. No order, payment, or shipment is created.</Text></View></View>
    <View style={styles.balanceRow}><Text style={styles.balanceLabel}>Available demo credits</Text><View style={styles.balancePill}><Icon name="paw" color={colors.navy} size={16} /><Text style={styles.balanceValue}>{balance.toLocaleString()} Peta Coin</Text></View></View>
    <View style={styles.products}>
      {products.map((product) => <View key={product.id} style={styles.productCard}>
        <ProductVisual product={product} />
        <View style={styles.productCopy}><Text style={styles.category}>{product.category}</Text><Text style={styles.productName}>{product.name}</Text><Text style={styles.productDetail}>{product.detail}</Text><View style={styles.productFoot}><View><Text style={styles.productPrice}>{product.points} <Text style={styles.priceUnit}>demo credits</Text></Text><Text style={styles.priceNote}>No cash or crypto value</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Preview ${product.name} demo redemption`} onPress={() => onRedeem(product)} style={({ pressed }) => [styles.productAction, pressed && styles.pressed]}><Icon name="arrow-forward" size={22} color={colors.onAction} /></Pressable></View></View>
      </View>)}
    </View>
    <View style={styles.infoCard}><Icon name="information-circle-outline" color={colors.slate} size={22} /><Text style={styles.infoText}>These products illustrate the Meta Pet concept. Wearable access, compatible hardware, and real merchant integrations still need to be connected.</Text></View>
    <ActionButton label="Preview companion collar" icon="paw-outline" onPress={() => onRedeem(products[0])} />
  </ScrollView>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cloud }, content: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 32, width: '100%', maxWidth: 760, alignSelf: 'center' }, flex: { flex: 1 },
  previewBanner: { flexDirection: 'row', gap: 12, padding: 17, borderRadius: 20, backgroundColor: colors.blueWash, alignItems: 'center' }, bannerTitle: { color: colors.navy, fontWeight: '700', fontSize: 14 }, bannerBody: { color: colors.slate, fontSize: 12, lineHeight: 18, marginTop: 3 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginVertical: 22 }, balanceLabel: { color: colors.slate, fontSize: 12 }, balancePill: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.goldWash, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12 }, balanceValue: { color: colors.navy, fontSize: 12, fontWeight: '700' },
  products: { gap: 20 }, productCard: { backgroundColor: colors.surface, borderRadius: 25, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  productCopy: { padding: 20 }, category: { color: colors.blue, textTransform: 'uppercase', fontSize: 10, fontWeight: '700', letterSpacing: 1.3 }, productName: { color: colors.navy, fontSize: 23, fontWeight: '700', letterSpacing: -0.5, marginTop: 7 }, productDetail: { color: colors.slate, fontSize: 13, lineHeight: 21, marginTop: 9 }, productFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 20 }, productPrice: { color: colors.navy, fontSize: 20, fontWeight: '800' }, priceUnit: { fontSize: 12, fontWeight: '600' }, priceNote: { color: colors.slate, fontSize: 10, marginTop: 4 }, productAction: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.actionBlue, alignItems: 'center', justifyContent: 'center' },
  infoCard: { flexDirection: 'row', gap: 10, marginVertical: 22, alignItems: 'flex-start' }, infoText: { color: colors.slate, fontSize: 11, lineHeight: 18, flex: 1 }, pressed: { opacity: 0.75 },
});


