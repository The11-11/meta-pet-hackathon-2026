import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { createAuthService, facebookProfile, readAuthConfiguration } from '../src/auth.mjs';
import { createMuseServer } from '../src/server.mjs';
import { createPageMemoryStore } from '../src/memory.mjs';

const configuredEnv = () => ({
  BETTER_AUTH_URL: 'http://localhost:8787',
  BETTER_AUTH_SECRET: 'test-only-auth-secret-with-more-than-32-characters',
  FACEBOOK_CLIENT_ID: '123456789', FACEBOOK_CLIENT_SECRET: 'test-only-facebook-secret',
  AUTH_DATABASE_PATH: ':memory:',
});
const json = body => ({ method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:8081', 'x-muse-remote-address': '127.0.0.1' }, body: JSON.stringify(body) });
const login = (extra = {}) => ({ provider: 'facebook', callbackURL: 'http://localhost:8081/auth/callback', errorCallbackURL: 'http://localhost:8081/auth/callback', disableRedirect: true, ...extra });

async function withAuth(run) {
  const service = createAuthService({ env: configuredEnv(), migrate: true });
  try {
    assert.equal((await service.getConfig()).available, true);
    await run(service, await service.initialize());
  } finally { await service.close(); }
}

async function withServer(options, run) {
  const temporary = await mkdtemp(join(tmpdir(), 'muse-auth-memory-test-'));
  const server = createMuseServer({ memoryStore: createPageMemoryStore({ root: join(temporary, 'memory') }), ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    const checked = resolve(temporary);
    assert.ok(checked.startsWith(resolve(tmpdir()) + sep) && basename(checked).startsWith('muse-auth-memory-test-'));
    await rm(checked, { recursive: true, force: true });
  }
}

test('auth readiness rejects missing secrets, unsafe origins and insecure production configuration', async () => {
  const service = createAuthService({ env: {} });
  assert.deepEqual(await service.getConfig(), {
    provider: 'facebook', available: false, baseURL: null, callbackURL: null,
    message: 'Facebook sign-in is unavailable. Complete the server configuration and run the authentication setup command.',
  });
  assert.equal(await service.getSession({ cookie: 'made-up-session' }), null);
  for (const override of [
    { BETTER_AUTH_SECRET: 'a'.repeat(40) }, { FACEBOOK_CLIENT_SECRET: '' },
    { AUTH_TRUSTED_ORIGINS: 'https://*.example.com' }, { AUTH_TRUSTED_ORIGINS: 'https://example.com/private' },
    { BETTER_AUTH_URL: 'https://user:secret@example.com' }, { NODE_ENV: 'production' },
  ]) assert.equal(readAuthConfiguration({ ...configuredEnv(), ...override }).configured, false);
  const config = readAuthConfiguration(configuredEnv());
  assert.deepEqual(config.webOrigins, ['http://localhost:8081', 'http://localhost:8083']);
  assert.ok(config.trustedOrigins.includes('metapet://'));
});

test('auth readiness checks schema and never returns application secrets', async () => {
  const missingSchema = createAuthService({ env: configuredEnv() });
  assert.equal((await missingSchema.getConfig()).available, false);
  await missingSchema.close();
  await withAuth(async service => {
    const config = await service.getConfig();
    assert.equal(config.callbackURL, 'http://localhost:8787/api/auth/callback/facebook');
    assert.equal(JSON.stringify(config).includes(configuredEnv().BETTER_AUTH_SECRET), false);
    assert.equal(JSON.stringify(config).includes(configuredEnv().FACEBOOK_CLIENT_SECRET), false);
  });
});

test('Facebook starts a correlated public-profile-only authorization flow without contacting Meta', async () => {
  await withAuth(async (_service, runtime) => {
    const response = await runtime.auth.handler(new Request('http://localhost:8787/api/auth/sign-in/social', json(login())));
    assert.equal(response.status, 200);
    const url = new URL((await response.json()).url);
    assert.equal(url.hostname, 'www.facebook.com');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('client_id'), '123456789');
    assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:8787/api/auth/callback/facebook');
    assert.ok(url.searchParams.get('state')?.length >= 20);
    assert.deepEqual(url.searchParams.get('scope').split(/[ ,]+/), ['public_profile']);
    assert.ok(response.headers.getSetCookie().length);
  });
});

test('untrusted browser origins and callback destinations cannot start authentication', async () => {
  await withAuth(async (_service, runtime) => {
    const badOrigin = json(login()); badOrigin.headers.origin = 'https://untrusted.example'; badOrigin.headers.cookie = 'existing-browser-cookie=value';
    assert.equal((await runtime.auth.handler(new Request('http://localhost:8787/api/auth/sign-in/social', badOrigin))).status, 403);
    assert.equal((await runtime.auth.handler(new Request('http://localhost:8787/api/auth/sign-in/social', json(login({ callbackURL: 'https://untrusted.example/steal' }))))).status, 403);
    assert.equal((await runtime.auth.handler(new Request('http://localhost:8787/api/auth/sign-in/social', json(login({ callbackURL: 'metapet://auth/callback' }))))).status, 200);
    assert.equal((await runtime.auth.handler(new Request('http://localhost:8787/api/auth/get-access-token', json({ accountId: 'unneeded' })))).status, 404);
  });
});

test('Facebook cancellation and forged callbacks do not create a session', async () => {
  await withAuth(async (service, runtime) => {
    const start = await runtime.auth.handler(new Request('http://localhost:8787/api/auth/sign-in/social', json(login())));
    const state = new URL((await start.json()).url).searchParams.get('state');
    const cookie = start.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const response = await runtime.auth.handler(new Request(`http://localhost:8787/api/auth/callback/facebook?error=access_denied&state=${encodeURIComponent(state)}`, { headers: { cookie } }));
    assert.ok(response.status >= 300 && response.status < 400);
    assert.match(response.headers.get('location'), /error=/);
    assert.equal(await service.getSession({ cookie }), null);
    const forged = await runtime.auth.handler(new Request('http://localhost:8787/api/auth/callback/facebook?code=invented&state=invented'));
    assert.ok(forged.status >= 300 && forged.status < 400);
    assert.equal(await service.getSession({ cookie: 'better-auth.session_token=invented' }), null);
  });
});

test('Facebook email fallback is internal, deterministic and never verified', () => {
  assert.deepEqual(facebookProfile({ id: '12345' }), { email: '12345@facebook.placeholder.invalid', emailVerified: false });
  assert.deepEqual(facebookProfile({ id: '12345', email: 'person@example.com' }), { email: 'person@example.com', emailVerified: false });
  assert.throws(() => facebookProfile({}), /invalid profile/);
});

test('Muse accepts a verified database session and rejects forged or revoked cookies', async () => {
  await withAuth(async (service, runtime) => {
    const { makeSignature } = await import('better-auth/crypto');
    const context = await runtime.auth.$context;
    // Disposable database fixture only: no external Facebook account is created.
    const user = await context.internalAdapter.createUser({ name: 'Auth test owner', email: 'owner@test.invalid', emailVerified: false });
    const session = await context.internalAdapter.createSession(user.id);
    const signature = await makeSignature(session.token, configuredEnv().BETTER_AUTH_SECRET);
    const cookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}`;
    assert.equal((await service.getSession({ cookie })).user.id, user.id);
    await withServer({ env: { MODEL_API_KEY: 'test-server-model-key' }, authService: service, fetchImpl: async () => Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Verified owner context.' }] }] }) }, async url => {
      const request = () => ({ ...json({ message: 'Summarize my records', pet: { id: 'pet', name: 'Kai' } }), headers: { 'content-type': 'application/json', cookie, 'X-Muse-Owner': user.id } });
      assert.equal((await fetch(`${url}/api/muse/chat`, request())).status, 200);
      const forged = request(); forged.headers.cookie = 'better-auth.session_token=forged';
      assert.equal((await fetch(`${url}/api/muse/chat`, forged)).status, 401);
      await context.internalAdapter.deleteSession(session.token);
      assert.equal((await fetch(`${url}/api/muse/chat`, request())).status, 401);
    });
  });
});

test('Muse binds the submitted owner to the verified cookie before forwarding pet data', async () => {
  await withAuth(async (service, runtime) => {
    const { makeSignature } = await import('better-auth/crypto');
    const context = await runtime.auth.$context;
    const owners = [];
    for (const name of ['Alice', 'Bob']) {
      const user = await context.internalAdapter.createUser({ name, email: `${name.toLowerCase()}@test.invalid`, emailVerified: false });
      const session = await context.internalAdapter.createSession(user.id);
      owners.push({ id: user.id, cookie: `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${await makeSignature(session.token, configuredEnv().BETTER_AUTH_SECRET)}`)}` });
    }
    const [alice, bob] = owners;
    const providerBodies = [];
    await withServer({ env: { MODEL_API_KEY: 'test-server-model-key' }, authService: service, fetchImpl: async (_url, options) => {
      providerBodies.push(JSON.parse(options.body));
      return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Owner context received.' }] }] });
    } }, async url => {
      const request = (cookie, ownerId, petName = 'Alice pet') => ({ ...json({ message: 'Summarize care', pet: { id: 'pet', name: petName } }), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(ownerId ? { 'X-Muse-Owner': ownerId } : {}) } });
      assert.equal((await fetch(`${url}/api/muse/chat`, request(alice.cookie, alice.id))).status, 200);
      assert.equal(providerBodies.length, 1);
      const beforeSwitch = JSON.stringify(providerBodies);
      // The old tab still holds Alice's records after Bob replaces its cookie.
      assert.equal((await fetch(`${url}/api/muse/chat`, request(bob.cookie, alice.id))).status, 401);
      assert.equal((await fetch(`${url}/api/muse/chat`, request(bob.cookie))).status, 401);
      assert.equal((await fetch(`${url}/api/muse/chat`, request('', bob.id))).status, 401, 'an owner header is not authentication');
      assert.equal((await fetch(`${url}/api/muse/check`, request(bob.cookie, alice.id))).status, 401);
      assert.equal((await fetch(`${url}/api/muse/avatar`, request(bob.cookie, alice.id))).status, 401);
      assert.equal(JSON.stringify(providerBodies), beforeSwitch, 'rejected owner bindings must not reach the provider');
      assert.equal((await fetch(`${url}/api/muse/chat`, request(bob.cookie, bob.id, 'Bob pet'))).status, 200);
      assert.equal(providerBodies.length, 2);
      assert.match(providerBodies[1].input[0].content, /Bob pet/);
      assert.doesNotMatch(providerBodies[1].input[0].content, /Alice pet/);
      const preflight = await fetch(`${url}/api/muse/chat`, { method: 'OPTIONS', headers: { origin: 'http://localhost:8081', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-muse-owner' } });
      assert.equal(preflight.status, 204);
      assert.ok(preflight.headers.get('access-control-allow-headers').toLowerCase().split(',').map(value => value.trim()).includes('x-muse-owner'));
    });
  });
});

test('existing local development token clients do not need owner-cookie binding', async () => {
  let providerCalls = 0;
  await withServer({ env: { MODEL_API_KEY: 'test-model-key', MUSE_CLIENT_TOKEN: 'test-development-token' }, fetchImpl: async () => {
    providerCalls += 1;
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Development request.' }] }] });
  } }, async url => {
    const request = json({ message: 'Summarize care', pet: { name: 'Kai' } });
    request.headers.authorization = 'Bearer test-development-token';
    assert.equal((await fetch(`${url}/api/muse/chat`, request)).status, 200);
    request.headers['X-Muse-Owner'] = 'not-a-session-owner';
    assert.equal((await fetch(`${url}/api/muse/chat`, request)).status, 200);
    assert.equal(providerCalls, 2);
  });
});

test('a verified local session survives restarting the authentication service', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'muse-auth-test-'));
  const env = { ...configuredEnv(), AUTH_DATABASE_PATH: join(directory, 'auth.sqlite') };
  let service;
  try {
    service = createAuthService({ env, migrate: true });
    const runtime = await service.initialize();
    assert.ok(runtime);
    const context = await runtime.auth.$context;
    const user = await context.internalAdapter.createUser({ name: 'Restart test owner', email: 'restart@test.invalid', emailVerified: false });
    const session = await context.internalAdapter.createSession(user.id);
    const { makeSignature } = await import('better-auth/crypto');
    const cookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${await makeSignature(session.token, env.BETTER_AUTH_SECRET)}`)}`;
    await service.close();
    service = createAuthService({ env });
    assert.equal((await service.getConfig()).available, true);
    assert.equal((await service.getSession({ cookie })).user.id, user.id);
  } finally {
    await service?.close();
    // Remove only the disposable directory created above, after checking its root.
    if (!resolve(directory).startsWith(`${resolve(tmpdir())}${sep}`) || !basename(directory).startsWith('muse-auth-test-')) throw new Error('Unsafe test cleanup path');
    await rm(directory, { recursive: true, force: true });
  }
});

test('Node auth routes preserve request bodies, exact CORS credentials and unavailable status', async () => {
  await withAuth(async (service) => {
    await withServer({ env: {}, authService: service }, async url => {
      const response = await fetch(`${url}/api/auth/sign-in/social`, json(login()));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:8081');
      assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
      assert.ok((await response.json()).url.includes('facebook.com'));
      const config = await fetch(`${url}/api/auth/config`, { headers: { origin: 'http://localhost:8083' } });
      assert.equal((await config.json()).available, true);
      assert.equal((await fetch(`${url}/api/auth/config`, { headers: { origin: 'https://untrusted.example' } })).status, 403);
    });
  });
  await withServer({ env: {} }, async url => {
    assert.equal((await (await fetch(`${url}/api/auth/config`)).json()).available, false);
    assert.equal((await fetch(`${url}/api/auth/sign-in/social`, json(login()))).status, 503);
  });
});

