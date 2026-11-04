import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';

// This is a public server address, never a Facebook secret or model API key.
export const AUTH_BASE_URL = (process.env.EXPO_PUBLIC_AUTH_URL?.trim() || 'http://localhost:8787').replace(/\/+$/, '');
export const authClient = createAuthClient({
  baseURL: AUTH_BASE_URL,
  plugins: [expoClient({ scheme: 'metapet', storagePrefix: 'musepet', storage: SecureStore })],
});
