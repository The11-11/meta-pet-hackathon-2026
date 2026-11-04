import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { bindDemoProfileHandoff, clearDemoProfileHandoff } from '../../demoProfileHandoff';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { useAuth } from '../../AuthContext';
import { useCare } from '../../CareContext';
import { FormPage, FormTitle, FormNote } from '../../components/forms';
import { ActionButton } from '../../components/ui';
import { useTheme } from '../../ThemeContext';

export default function FacebookCallback() {
  const { owner, refreshSession } = useAuth();
  const { ready, onboardingComplete, refreshProfileHandoff } = useCare();
  const { colors } = useTheme();
  const { error: providerError, handoff } = useLocalSearchParams<{ error?: string; handoff?: string }>();
  const handoffId = typeof handoff === 'string' && /^handoff-[0-9]+-[a-z0-9]{1,16}$/.test(handoff) ? handoff : undefined;
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      if (providerError) {
        if (handoffId) await clearDemoProfileHandoff(AsyncStorage, handoffId);
        throw new Error('Sign-in was not completed. Try again or explore the preview.');
      }
      // On native, this awaits the complete browser flow and persisted cookie.
      // It never promotes the local demo into an authenticated owner.
      const selected = await refreshSession();
      if (selected?.mode === 'facebook' && handoffId) {
        const bound = await bindDemoProfileHandoff(AsyncStorage, handoffId, selected.id);
        if (!bound) throw new Error('The demo profile changed or this choice expired. Return to the demo and connect again.');
      }
      return selected;
    })().then(value => { if (active) { if (value?.mode === 'facebook') setVerified(true); else setError('Sign-in was not completed. Try again or explore the preview.'); } })
      .catch(() => { if (active) setError('We could not finish this profile connection. Your demo is still saved; return to the demo and try again.'); });
    return () => { active = false; };
  }, [providerError, handoffId, refreshSession]);
  useEffect(() => {
    let active = true;
    if (verified && owner?.mode === 'facebook' && ready && !error && !providerError) {
      void refreshProfileHandoff().then(pending => { if (active) router.replace(pending ? '/keep-profile' : onboardingComplete ? '/' : '/onboarding'); }).catch(() => { if (active) setError('Your profile choice could not load. Reopen the app and retry.'); });
    }
    return () => { active = false; };
  }, [verified, owner?.id, owner?.mode, ready, onboardingComplete, refreshProfileHandoff, error, providerError]);
  return <FormPage><FormTitle title="A moment, pet parent." body="We’re checking your Facebook sign-in." />{error ? <><FormNote error>{error}</FormNote><ActionButton label="Back to welcome" onPress={() => router.replace('/welcome')} /></> : <><ActivityIndicator color={colors.blue} /><Text style={{ color: colors.slate }}>Bringing your care space together…</Text></>}</FormPage>;
}
