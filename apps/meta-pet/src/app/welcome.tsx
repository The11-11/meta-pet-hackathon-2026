import Ionicons from '@expo/vector-icons/Ionicons';
import { PUBLIC_DEMO_ONLY } from '../demoMode';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../AuthContext';
import { BrandHeader } from '../components/BrandHeader';
import { MuseDog } from '../components/MuseDog';
import { useTheme } from '../ThemeContext';

export default function WelcomeRoute() {
  const { colors } = useTheme();
  const { loginWithFacebook, startDemo } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function enter(method: 'facebook' | 'demo') {
    if (pending) return;
    setPending(true); setError('');
    try { if (method === 'facebook') await loginWithFacebook(); else await startDemo(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not continue. Please try again.'); }
    finally { setPending(false); }
  }
  return <View style={{ flex: 1, backgroundColor: colors.cloud }}><BrandHeader /><ScrollView contentContainerStyle={styles.page}>
    <View style={[styles.preview, { backgroundColor: colors.blueWash }]}><View style={[styles.dot, { backgroundColor: colors.blue }]} /><Text style={{ color: colors.blue, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>YOUR PET’S COMPANION</Text></View>
    <View style={[styles.art, { backgroundColor: colors.violetWash }]}><View style={[styles.orbit, { borderColor: colors.line }]} /><MuseDog style={styles.kai} /><View style={[styles.kaiLabel, { backgroundColor: colors.surface }]}><Ionicons name="sparkles" color={colors.violet} size={14} /><Text style={{ color: colors.navy, fontSize: 12, fontWeight: '700' }}>Meet Kai. Yours starts with a photo.</Text></View></View>
    <View style={{ gap: 12 }}><Text style={[styles.title, { color: colors.navy }]}>Their face.{"\n"}Their own Muse.</Text><Text style={[styles.body, { color: colors.slate }]}>{PUBLIC_DEMO_ONLY ? 'Meet Muse Pet, your guide through this demo. Create a pet profile, review a care moment together, then explore supplies and local support.' : 'Sign in, create your pet’s profile and turn a photo into their custom Muse avatar. Then bring their care, routines and little moments together.'}</Text></View>
    <View style={styles.features}>{(PUBLIC_DEMO_ONLY ? ['Pet profile', 'Guided care', 'Pet supplies'] : ['Pet profile', 'Photo to avatar', 'Muse companion']).map(label => <View key={label} style={[styles.feature, { borderColor: colors.line, backgroundColor: colors.surface }]}><Ionicons name="checkmark-circle" color={colors.violet} size={16} /><Text style={{ color: colors.navy, fontSize: 12 }}>{label}</Text></View>)}</View>
    {!PUBLIC_DEMO_ONLY && <><Pressable accessibilityRole="button" accessibilityLabel="Continue with Facebook" accessibilityState={{ disabled: pending }} disabled={pending} onPress={() => void enter('facebook')} style={({ pressed }) => [styles.facebook, { opacity: pending || pressed ? 0.7 : 1 }]}>{pending ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="logo-facebook" color="#FFFFFF" size={23} />}<Text style={styles.facebookText}>Continue with Facebook</Text></Pressable>
    <Text style={[styles.fine, { color: colors.slate }]}>Sign in with your Facebook account, then manage your pet’s profile here. Facebook shares your basic profile. Nothing is posted to social media.</Text></>}
    {!!error && <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: colors.errorWash }]}><Text style={{ color: colors.danger, fontSize: 13, lineHeight: 20 }}>{error}</Text></View>}
    <Pressable accessibilityRole="button" disabled={pending} onPress={() => void enter('demo')} style={[styles.demo, { borderColor: colors.line, backgroundColor: colors.surface }]}><Text style={{ color: colors.navy, fontWeight: '700', fontSize: 15 }}>{PUBLIC_DEMO_ONLY ? 'Let Muse guide me' : 'Explore the demo'}</Text><Ionicons name="arrow-forward" color={colors.navy} size={19} /></Pressable>
    <Text style={[styles.fine, { color: colors.slate }]}>{PUBLIC_DEMO_ONLY ? 'Interactive preview guide · your data stays in this browser. Live AI, Facebook sign-in and photo-to-avatar generation are being connected separately.' : 'The demo uses a local profile. It does not create a Facebook account or sign you in to Facebook.'}</Text>
    <Text style={[styles.footer, { color: colors.slate }]}>Independent hackathon project · Meta Pet{"\n"}Part of Petaverse</Text>
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 570, alignSelf: 'center', padding: 24, paddingBottom: 40, gap: 18 },
  preview: { alignSelf: 'flex-start', flexDirection: 'row', gap: 7, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 11, borderRadius: 20 }, dot: { width: 6, height: 6, borderRadius: 3 },
  art: { height: 245, borderRadius: 32, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, orbit: { position: 'absolute', width: 240, height: 240, borderWidth: 1, borderRadius: 120, top: 20 }, kai: { width: 265, height: 245 }, kaiLabel: { position: 'absolute', bottom: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  title: { fontSize: 38, lineHeight: 43, fontWeight: '800', letterSpacing: -1.4 }, body: { fontSize: 15, lineHeight: 23 }, features: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, feature: { flexDirection: 'row', gap: 6, alignItems: 'center', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12 },
  facebook: { backgroundColor: '#0866FF', minHeight: 55, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 11 }, facebookText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }, fine: { fontSize: 11, lineHeight: 17 }, notice: { padding: 14, borderRadius: 15 }, demo: { minHeight: 52, borderWidth: 1, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, footer: { fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 7 },
});
