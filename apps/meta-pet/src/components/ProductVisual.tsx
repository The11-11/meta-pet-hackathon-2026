import { Image, type ImageSource } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import type { Product } from '../types';
import { Badge, Icon } from './ui';

type ProductVisualProps = {
  product: Pick<Product, 'id' | 'name'>;
  detail?: boolean;
};

type ProductArtwork = {
  source: ImageSource;
  wash: 'blueWash' | 'violetWash' | 'mintWash';
};

// Static paths keep all three product concepts available in native builds.
const productArtwork: Record<string, ProductArtwork> = {
  collar: { source: require('../../assets/products/meta-collar-v1.png'), wash: 'blueWash' },
  camera: { source: require('../../assets/products/care-camera-v1.png'), wash: 'violetWash' },
  feeder: { source: require('../../assets/products/smart-feeder-v1.png'), wash: 'mintWash' },
};

export function ProductVisual({ product, detail = false }: ProductVisualProps) {
  const { colors } = useTheme();
  const artwork = productArtwork[product.id];

  return <View style={[styles.stage, detail && styles.detail, { backgroundColor: colors[artwork?.wash ?? 'blueWash'] }]}>
    {artwork ? <Image source={artwork.source} contentFit="contain" accessible accessibilityLabel={product.name + ' product concept'} style={styles.image} /> : <Icon name="cube-outline" size={58} color={colors.blue} />}
    <View style={styles.badge}><Badge text="Product concept" tone={artwork?.wash === 'violetWash' ? 'violet' : artwork?.wash === 'mintWash' ? 'mint' : 'blue'} /></View>
  </View>;
}

const styles = StyleSheet.create({
  stage: { width: '100%', height: 250, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingTop: 35, paddingBottom: 12, overflow: 'hidden' },
  detail: { height: 290, borderRadius: 24 },
  image: { width: '100%', height: '100%', maxWidth: 420 },
  badge: { position: 'absolute', top: 14, left: 14 },
});
