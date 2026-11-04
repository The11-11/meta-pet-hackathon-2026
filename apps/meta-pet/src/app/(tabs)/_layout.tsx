import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { BrandHeader } from '../../components/BrandHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return <View style={{ flex: 1 }}><BrandHeader /><Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.blue, tabBarInactiveTintColor: colors.slate, tabBarStyle: { height: 68 + insets.bottom, paddingTop: 9, paddingBottom: Math.max(insets.bottom, 10), backgroundColor: colors.surface, borderTopColor: colors.line }, tabBarLabelStyle: { fontSize: 11, fontWeight: '600' } }}>
    <Tabs.Screen name="index" options={{ title: 'Care', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'heart' : 'heart-outline'} size={23} color={color} /> }} />
    <Tabs.Screen name="muse" options={{ title: 'Muse Pet', tabBarActiveTintColor: colors.violet, tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'sparkles' : 'sparkles-outline'} size={23} color={color} /> }} />
    <Tabs.Screen name="shop" options={{ title: 'Shop', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'bag-handle' : 'bag-handle-outline'} size={23} color={color} /> }} />
    <Tabs.Screen name="rewards" options={{ title: 'Peta Coin', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'gift' : 'gift-outline'} size={23} color={color} /> }} />
  </Tabs></View>;
}


