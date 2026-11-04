// Native session cookies must only travel to the configured authentication server.
export function isAuthDestination(destination: string, authBaseURL: string): boolean {
  try {
    const target = new URL(destination);
    const auth = new URL(authBaseURL);
    return ['http:', 'https:'].includes(target.protocol) && !target.username && !target.password &&
      target.origin === auth.origin && target.pathname.replace(/\/+$/, '') === auth.pathname.replace(/\/+$/, '') &&
      !target.search && !target.hash;
  } catch { return false; }
}
