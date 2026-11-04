import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CareProvider, useCare } from '../CareContext';
import { ThemeProvider, useTheme } from '../ThemeContext';
import type { ThemeColors } from '../theme';
import { AuthProvider, useAuth } from '../AuthContext';
import { PetNotificationProvider } from '../PetNotificationContext';

function Navigation() {
  const { ready, storageError, onboardingComplete, profileHandoff } = useCare();
  const { owner, ready: authReady } = useAuth();
  const { colors, mode, ready: themeReady, error: themeError } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!authReady || !ready || !themeReady) return <View style={styles.loading}><ActivityIndicator color={colors.blue} /><Text style={styles.loadingText}>Getting their day ready…</Text></View>;
  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.root}>
    <StatusBar style={mode === 'night' ? 'light' : 'dark'} />
    {!!storageError && <View accessibilityRole="alert" style={styles.warning}><Text style={styles.warningText}>{storageError}</Text></View>}
    {!!themeError && <View accessibilityRole="alert" style={styles.warning}><Text style={styles.warningText}>{themeError}</Text></View>}
    <Stack screenOptions={{ headerTintColor: colors.navy, headerStyle: { backgroundColor: colors.cloud }, contentStyle: { backgroundColor: colors.cloud }, headerShadowVisible: false }}>
      <Stack.Protected guard={!owner}><Stack.Screen name="welcome" options={{ headerShown: false }} /></Stack.Protected>
      <Stack.Protected guard={owner?.mode === 'facebook' && Boolean(profileHandoff)}><Stack.Screen name="keep-profile" options={{ title: 'Keep your pet profile', headerBackVisible: false }} /></Stack.Protected>
      <Stack.Protected guard={Boolean(owner) && !profileHandoff && !onboardingComplete}><Stack.Screen name="onboarding" options={{ headerShown: false }} /></Stack.Protected>
      <Stack.Protected guard={Boolean(owner) && !profileHandoff && onboardingComplete}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="entry" options={{ title: 'Record care', presentation: 'modal' }} />
      <Stack.Screen name="appointment" options={{ title: 'Vet appointment', presentation: 'modal' }} />
      <Stack.Screen name="settings" options={{ title: 'Your pet & settings' }} />
      <Stack.Screen name="avatar" options={{ title: 'Your pet’s Muse avatar' }} />
      <Stack.Screen name="social" options={{ title: 'Your pet’s social pages' }} />
      <Stack.Screen name="slideshow" options={{ title: 'Muse memory studio' }} />
      <Stack.Screen name="trainers" options={{ title: 'Find dog trainers' }} />
      <Stack.Screen name="memory" options={{ title: 'Muse page memory' }} />
      <Stack.Screen name="collar" options={{ title: 'Companion collar' }} />
      <Stack.Screen name="redeem" options={{ title: 'Demo redemption', presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
    </Stack>
  </SafeAreaView>;
}
function ScopedNotifications({ children }: { children: ReactNode }) {
  const { owner } = useAuth();
  const { data } = useCare();
  const scope = owner ? `${owner.mode}:${owner.id}:${data.pet.id}` : 'signed-out';
  return <PetNotificationProvider key={scope}>{children}</PetNotificationProvider>;
}
export default function RootLayout() { return <SafeAreaProvider><ThemeProvider><AuthProvider><CareProvider><ScopedNotifications><Navigation /></ScopedNotifications></CareProvider></AuthProvider></ThemeProvider></SafeAreaProvider>; }
const createStyles = (colors: ThemeColors) => StyleSheet.create({ root: { flex: 1, backgroundColor: colors.cloud }, loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 15, backgroundColor: colors.cloud }, loadingText: { color: colors.slate }, warning: { padding: 12, backgroundColor: colors.goldWash }, warningText: { color: colors.navy, fontSize: 12 } });
