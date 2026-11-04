import { testMuseConnection } from './muse.ts';

export type PreviewConnectionResult = { verified: boolean; message: string };
type ConnectionOptions = {
  address: string;
  token: string;
  activate: (address: string, token: string) => Promise<void>;
  getSession: () => number;
  isCurrentOwner: () => boolean;
  check?: typeof testMuseConnection;
};

/** Select onboarding help, never authentication policy. Public HTTPS uses Facebook;
 * HTTP, loopback and private-network endpoints retain the local developer flow. */
export function onboardingPreviewMode(authAddress: string, previewOnly = false): 'guide' | 'development' | 'facebook' {
  if (previewOnly) return 'guide';
  try {
    const address = new URL(authAddress);
    if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password) return 'guide';
    const host = address.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const octets = host.split('.').map(Number);
    const ipv4 = /^\d+\.\d+\.\d+\.\d+$/.test(host) && octets.every(value => value >= 0 && value <= 255);
    const privateHost = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' ||
      (host.includes(':') && /^(?:f[cd]|fe[89ab])/i.test(host)) ||
      (ipv4 && (octets[0] === 127 || octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 169 && octets[1] === 254)));
    return address.protocol === 'http:' || privateHost ? 'development' : 'facebook';
  } catch { return 'guide'; }
}

export function onboardingConnectionAddress(value: string): string {
  const address = value.trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(address);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error();
    return address;
  } catch {
    throw new Error('Enter a valid Muse server address without a password, query or fragment.');
  }
}

// This check sends no photo, profile or care records. Activation must finish
// before the provider check, and a changed account/session invalidates its result.
export async function connectOnboardingMuse({ address, token, activate, getSession, isCurrentOwner, check = testMuseConnection }: ConnectionOptions): Promise<PreviewConnectionResult> {
  const destination = onboardingConnectionAddress(address);
  const connectionToken = token.trim();
  if (!isCurrentOwner()) throw new Error('Your preview account changed. Please try again.');
  const expectedSession = getSession() + 1;
  await activate(destination, connectionToken);
  const assertCurrent = () => {
    if (!isCurrentOwner() || getSession() !== expectedSession) throw new Error('Your preview or Muse connection changed. Please test again.');
  };
  assertCurrent();
  const result = await check(destination, connectionToken, { credentials: 'omit' });
  assertCurrent();
  return result;
}
