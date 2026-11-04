import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { dayColors, nightColors, type ThemeColors, type ThemeMode, type ThemePreference } from './theme';

const STORAGE_KEY = 'muse-pet.appearance.v1';
type ThemeState = {
  colors: ThemeColors; mode: ThemeMode; preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void; ready: boolean; error: string;
};
const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const deviceMode = useColorScheme();
  const [preference, updatePreference] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then(value => {
      if (active && (value === 'day' || value === 'night' || value === 'system')) updatePreference(value);
    }).catch(() => {
      if (active) setError('Your saved appearance could not be loaded. You can choose a mode again.');
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const setPreference = useCallback((value: ThemePreference) => {
    updatePreference(value);
    setError('');
    writes.current = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(STORAGE_KEY, value))
      .catch(() => { setError('Appearance changed, but could not be saved on this device.'); });
  }, []);
  const mode: ThemeMode = preference === 'system' ? (deviceMode === 'dark' ? 'night' : 'day') : preference;
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const root = document.documentElement;
    const previousScheme = root.style.colorScheme;
    const previousBackground = root.style.backgroundColor;
    root.style.colorScheme = mode === 'night' ? 'dark' : 'light';
    root.style.backgroundColor = mode === 'night' ? nightColors.cloud : dayColors.cloud;
    return () => { root.style.colorScheme = previousScheme; root.style.backgroundColor = previousBackground; };
  }, [mode]);
  return <ThemeContext.Provider value={{ colors: mode === 'night' ? nightColors : dayColors, mode, preference, setPreference, ready, error }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('ThemeProvider is required');
  return theme;
}
