import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import type { PreviewConnectionResult } from '../onboardingConnection';
import type { ThemeColors } from '../theme';
import { FormNote } from './forms';
import { ActionButton, Icon } from './ui';

export type OnboardingPreviewConnection = {
  initialUrl: string;
  initialToken: string;
  onConnect: (address: string, token: string) => Promise<PreviewConnectionResult>;
};

type Props = OnboardingPreviewConnection & { disabled: boolean };

export function OnboardingMuseConnection({ initialUrl, initialToken, onConnect, disabled }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const [address, setAddress] = useState(initialUrl);
  const [token, setToken] = useState(initialToken);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<PreviewConnectionResult | null>(null);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const busy = checking || disabled;

  function edit(field: 'address' | 'token', value: string) {
    if (inFlight.current || disabled) return;
    if (field === 'address') setAddress(value);
    else setToken(value);
    setResult(null);
    setError('');
  }

  async function connect() {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setChecking(true);
    setResult(null);
    setError('');
    try {
      setResult(await onConnect(address, token));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Muse could not connect. Check your preview details and try again.');
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }

  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel="Connect Muse for this preview"
      accessibilityState={{ expanded, disabled: busy }} disabled={busy}
      onPress={() => setExpanded(value => !value)}
      style={({ pressed }) => [styles.heading, pressed && styles.pressed]}>
      <View style={styles.icon}><Icon name="link-outline" color={colors.blue} size={21} /></View>
      <View style={styles.headingCopy}>
        <Text style={styles.title}>Connect Muse for this preview</Text>
        <Text style={styles.subtitle}>{result?.verified ? 'Live Muse connection verified' : 'Optional · create a custom avatar'}</Text>
      </View>
      <Icon name={expanded ? 'chevron-up' : 'chevron-down'} color={colors.slate} size={18} />
    </Pressable>
    {expanded ? <View style={styles.details}>
      <Text style={styles.body}>Use your own Muse connection to bring their photo to life. You can also skip the photo and start with Kai.</Text>
      <View style={styles.field}>
        <Text style={styles.label}>Muse server address</Text>
        <TextInput accessibilityLabel="Preview Muse server address" value={address} onChangeText={value => edit('address', value)}
          editable={!busy} autoCapitalize="none" autoCorrect={false} autoComplete="off" maxLength={600}
          placeholder="https://your-muse-server.example" placeholderTextColor={colors.slate} style={styles.input} />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Connection token</Text>
        <TextInput accessibilityLabel="Preview connection token" value={token} onChangeText={value => edit('token', value)}
          editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="none"
          maxLength={600} placeholder="Your private connection token" placeholderTextColor={colors.slate} style={styles.input} />
      </View>
      <Text style={styles.hint}>The connection token stays in memory for this app session. Your Meta model API key stays on your server.</Text>
      <ActionButton label={checking ? 'Checking Muse…' : 'Connect and test Muse'} icon={checking ? undefined : 'link-outline'}
        disabled={busy || !address.trim()} onPress={() => void connect()} />
      {checking ? <View accessibilityRole="progressbar" accessibilityLabel="Checking your Muse connection"
        accessibilityState={{ busy: true }} style={styles.checking}>
        <ActivityIndicator size="small" color={colors.blue} />
        <Text style={styles.body}>Checking Muse without sending your pet’s photo or details.</Text>
      </View> : null}
      {result ? <View accessibilityLiveRegion="polite"><FormNote>{result.verified ? `Live connection verified. ${result.message}` : result.message}</FormNote></View> : null}
      {error ? <FormNote error>{error}</FormNote> : null}
      <Text style={styles.hint}>Test applies these details to this preview. Your photo is sent only when you choose Generate Muse avatar.</Text>
    </View> : null}
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  heading: { minHeight: 76, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.blueWash, justifyContent: 'center', alignItems: 'center' },
  headingCopy: { flex: 1, gap: 4 }, title: { fontSize: 14, lineHeight: 19, fontWeight: '700', color: colors.navy },
  subtitle: { fontSize: 12, lineHeight: 17, color: colors.slate },
  details: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  body: { fontSize: 13, lineHeight: 20, color: colors.slate, flexShrink: 1 },
  hint: { fontSize: 11, lineHeight: 17, color: colors.slate },
  field: { gap: 7 }, label: { fontSize: 12, lineHeight: 17, fontWeight: '700', color: colors.navy },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.cloud, color: colors.navy, padding: 13, fontSize: 14 },
  checking: { flexDirection: 'row', alignItems: 'center', gap: 10 }, pressed: { opacity: 0.75 },
});
