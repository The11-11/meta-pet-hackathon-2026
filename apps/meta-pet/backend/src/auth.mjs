import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BACKEND_ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_WEB_ORIGINS = ['http://localhost:8081', 'http://localhost:8083'];
const UNAVAILABLE = 'Facebook sign-in is unavailable. Complete the server configuration and run the authentication setup command.';

function webOrigin(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/' || value.includes('*')) return null;
    return url.origin;
  } catch { return null; }
}

export function readAuthConfiguration(env = process.env) {
  const value = name => typeof env[name] === 'string' ? env[name].trim() : '';
  const baseURL = webOrigin(value('BETTER_AUTH_URL'));
  const secret = value('BETTER_AUTH_SECRET');
  const clientId = value('FACEBOOK_CLIENT_ID');
  const clientSecret = value('FACEBOOK_CLIENT_SECRET');
  const requestedOrigins = value('AUTH_TRUSTED_ORIGINS') ? value('AUTH_TRUSTED_ORIGINS').split(',').map(item => item.trim()).filter(Boolean) : DEFAULT_WEB_ORIGINS;
  const parsedOrigins = requestedOrigins.map(webOrigin);
  const webOrigins = [...new Set(parsedOrigins.filter(Boolean))];
  const secureProduction = env.NODE_ENV !== 'production' || (!!baseURL && new URL(baseURL).protocol === 'https:' && webOrigins.every(origin => origin.startsWith('https://')));
  const configured = Boolean(baseURL && secret.length >= 32 && new Set(secret).size >= 8 && !/change.?me|replace.?this|placeholder/i.test(secret) && /^\d+$/.test(clientId) && clientSecret && requestedOrigins.length && parsedOrigins.every(Boolean) && secureProduction);
  return {
    configured, baseURL, secret, clientId, clientSecret,
    webOrigins,
    trustedOrigins: [...new Set([...(baseURL ? [baseURL] : []), ...webOrigins, 'metapet://'])],
    databasePath: value('AUTH_DATABASE_PATH') === ':memory:' ? ':memory:' : resolve(BACKEND_ROOT, value('AUTH_DATABASE_PATH') || 'data/auth.sqlite'),
  };
}

export function facebookProfile(profile) {
  if (!profile || !/^\d+$/.test(String(profile.id ?? ''))) throw new Error('Facebook returned an invalid profile.');
  // The reserved .invalid fallback satisfies the library's required email field;
  // it is an internal identifier, never a deliverable contact address.
  return {
    email: typeof profile.email === 'string' && profile.email.trim() ? profile.email.trim() : `${profile.id}@facebook.placeholder.invalid`,
    emailVerified: false,
  };
}

export function createAuthService({ env = process.env, migrate = false } = {}) {
  const config = readAuthConfiguration(env);
  let pending;
  let failed = false;
  let closed = false;
  const initialize = async () => {
    if (!config.configured || failed || closed) return null;
    if (!pending) pending = (async () => {
      // Keep demo/server tests dependency-free when Facebook is not configured.
      const [{ betterAuth }, { expo }, { toNodeHandler, fromNodeHeaders }, { getMigrations }, { DatabaseSync }] = await Promise.all([
        import('better-auth'), import('@better-auth/expo'), import('better-auth/node'), import('better-auth/db/migration'), import('node:sqlite'),
      ]);
      if (config.databasePath !== ':memory:') mkdirSync(dirname(config.databasePath), { recursive: true });
      const database = new DatabaseSync(config.databasePath);
      try {
        const options = {
          appName: 'Meta Pet', baseURL: config.baseURL, basePath: '/api/auth', secret: config.secret,
          database, trustedOrigins: config.trustedOrigins,
          emailAndPassword: { enabled: false },
          // Login does not need client-facing provider-token/profile endpoints.
          disabledPaths: ['/get-access-token', '/refresh-token', '/account-info'],
          socialProviders: {
            // Email is not needed for app identity. Disable the provider's
            // default email scope and use its supported singular scope option.
            facebook: { clientId: config.clientId, clientSecret: config.clientSecret, disableDefaultScope: true, scope: ['public_profile'], disableIdTokenSignIn: true, mapProfileToUser: facebookProfile },
          },
          account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
          session: { expiresIn: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60, cookieCache: { enabled: false } },
          rateLimit: { enabled: true, window: 60, max: 30, storage: 'database' },
          advanced: { ipAddress: { ipAddressHeaders: ['x-muse-remote-address'] } },
          plugins: [expo()],
        };
        const migration = await getMigrations(options);
        if (migrate) await migration.runMigrations();
        else if (migration.toBeCreated.length || migration.toBeAdded.length || migration.toBeAddedIndexes.length || migration.schemaProblems.length) throw new Error('Authentication database setup is required.');
        const auth = betterAuth(options);
        await auth.$context;
        return { auth, handler: toNodeHandler(auth), fromNodeHeaders, database };
      } catch (error) {
        database.close();
        throw error;
      }
    })().catch(() => { failed = true; return null; });
    return pending;
  };
  return {
    webOrigins: config.webOrigins,
    trustedOrigins: config.trustedOrigins,
    initialize,
    async getConfig() {
      const runtime = await initialize();
      return {
        provider: 'facebook', available: Boolean(runtime), baseURL: config.baseURL,
        callbackURL: config.baseURL ? `${config.baseURL}/api/auth/callback/facebook` : null,
        message: runtime ? 'Facebook sign-in is configured. Continue to Facebook to verify your account.' : UNAVAILABLE,
      };
    },
    async handle(request, response) {
      const runtime = await initialize();
      if (!runtime) return false;
      await runtime.handler(request, response);
      return true;
    },
    async getSession(headers) {
      const runtime = await initialize();
      if (!runtime) return null;
      try { return await runtime.auth.api.getSession({ headers: runtime.fromNodeHeaders(headers) }); }
      catch { return null; }
    },
    async getFacebookAccessToken(headers) {
      const runtime = await initialize();
      if (!runtime) return null;
      try {
        const sessionHeaders = runtime.fromNodeHeaders(headers);
        const session = await runtime.auth.api.getSession({ headers: sessionHeaders });
        if (!session?.session?.id || !session?.user?.id) return null;
        const accounts = await runtime.auth.api.listUserAccounts({ headers: sessionHeaders });
        const account = accounts.find(item => item.providerId === 'facebook' && item.userId === session.user.id);
        if (!account) return null;
        // Internal API call only: provider-token HTTP endpoints stay disabled.
        const tokens = await runtime.auth.api.getAccessToken({ headers: sessionHeaders, body: { accountId: account.id } });
        if (typeof tokens.accessToken !== 'string' || !tokens.accessToken.trim()) return null;
        return { token: tokens.accessToken, scopes: Array.isArray(tokens.scopes) ? tokens.scopes.filter(scope => typeof scope === 'string') : [] };
      } catch { return null; }
    },
    async close() {
      if (closed) return;
      closed = true;
      const runtime = pending ? await pending : null;
      runtime?.database.close();
    },
  };
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  if (!process.argv.includes('--migrate')) throw new Error('Use the authentication setup command.');
  const service = createAuthService({ migrate: true });
  const config = await service.getConfig();
  await service.close();
  if (!config.available) {
    console.error(config.message);
    process.exitCode = 1;
  } else console.log('Muse Pet authentication database is ready. Facebook sign-in still requires valid Meta app credentials and an allowed callback URL.');
}
