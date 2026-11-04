import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAuthService } from '../src/auth.mjs';
import { createMuseServer } from '../src/server.mjs';
import { FACEBOOK_GRAPH_VERSION, readFacebookLocations } from '../src/facebook-location.mjs';

const token = 'unit-only-facebook-provider-token';
const access = scopes => ({ token, scopes: scopes ?? ['user_location', 'pages_show_list', 'pages_read_engagement'] });
const env = () => ({
  BETTER_AUTH_URL: 'http://localhost:8787',
  BETTER_AUTH_SECRET: 'unit-only-auth-secret-with-more-than-32-characters',
  FACEBOOK_CLIENT_ID: '123456789', FACEBOOK_CLIENT_SECRET: 'unit-only-facebook-secret',
  AUTH_DATABASE_PATH: ':memory:',
});
async function withServer(options, run) {
  const server = createMuseServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run('http://127.0.0.1:' + server.address().port); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const ownerSession = { session: { id: 'session-owner' }, user: { id: 'owner-1' } };
function fakeAuth(overrides = {}) {
  return {
    webOrigins: ['http://localhost:8083'], close: async () => {},
    getSession: async headers => headers.cookie === 'valid-owner-cookie' ? ownerSession : null,
    getFacebookAccessToken: async () => access(), ...overrides,
  };
}
const ownerHeaders = { cookie: 'valid-owner-cookie', 'X-Muse-Owner': 'owner-1', origin: 'http://localhost:8083' };

test('profile import requests only the fixed city field and keeps provider credentials server-side', async () => {
  const requests = [];
  const result = await readFacebookLocations({ source: 'profile', access: access(), fetchImpl: async (url, options) => {
    requests.push({ url: new URL(url), options });
    return Response.json({ id: 'private-user', email: 'owner@example.invalid', location: { id: 'city-id', name: ' Cape Town,  Western Cape ', street: 'Private street', latitude: -33.1, longitude: 18.2 } });
  } });
  assert.deepEqual(result.locations, [{ id: 'facebook-profile-city', source: 'facebook_profile', label: 'Facebook profile city', area: 'Cape Town, Western Cape' }]);
  assert.equal(result.status, 'available');
  assert.equal(requests[0].url.origin, 'https://graph.facebook.com');
  assert.equal(requests[0].url.pathname, '/' + FACEBOOK_GRAPH_VERSION + '/me');
  assert.equal(requests[0].url.searchParams.get('fields'), 'location{id,name}');
  assert.equal(requests[0].url.searchParams.has('access_token'), false);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer ' + token);
  assert.equal(requests[0].options.redirect, 'error');
  assert.doesNotMatch(JSON.stringify(result), /private-user|owner@example|Private street|latitude|longitude|unit-only-facebook/);
});

test('Page import returns only bounded coarse areas, deduplicates IDs and never follows paging links', async () => {
  let calls = 0;
  const pages = Array.from({ length: 30 }, (_, index) => ({ id: String(100 + index), name: 'Page ' + index, location: { city: 'Durban', state: 'KwaZulu-Natal', country: 'South Africa', street: 'Private address', zip: '1234', latitude: 1.123, longitude: 2.234 } }));
  const result = await readFacebookLocations({ source: 'pages', access: access(), fetchImpl: async (rawUrl) => {
    calls += 1;
    const url = new URL(rawUrl);
    assert.equal(url.pathname, '/' + FACEBOOK_GRAPH_VERSION + '/me/accounts');
    assert.equal(url.searchParams.get('limit'), '25');
    assert.equal(url.searchParams.get('fields'), 'id,name,location{city,country,state}');
    return Response.json({ data: pages, paging: { next: 'https://untrusted.invalid/?secret=token' } });
  } });
  assert.equal(calls, 1);
  assert.equal(result.locations.length, 25);
  assert.deepEqual(result.locations[0], { id: 'facebook-page-100', source: 'facebook_page', label: 'Page 0', area: 'Durban, KwaZulu-Natal, South Africa' });
  assert.doesNotMatch(JSON.stringify(result), /Private address|latitude|longitude|paging|secret|unit-only-facebook/);
  const cleaned = await readFacebookLocations({ source: 'pages', access: access(), fetchImpl: async () => Response.json({ data: [
    { id: '1', name: 'A'.repeat(200), location: { city: '  City\n Centre ', country: 'South Africa' } },
    { id: '1', name: 'Duplicate', location: { city: 'Another' } },
    { id: '2', location: { street: 'Not an area', latitude: 23 } }, { id: '../steal', location: { city: 'City' } },
  ] }) });
  assert.equal(cleaned.locations.length, 1);
  assert.equal(cleaned.locations[0].label.length, 80);
  assert.equal(cleaned.locations[0].area, 'City Centre, South Africa');
});

test('imported profile and Page areas fit the trainer finder limit using whole area components', async () => {
  const city = 'C'.repeat(70);
  const longState = 'S'.repeat(35);
  const expected = city + ', South Africa';
  const profile = await readFacebookLocations({ source: 'profile', access: access(), fetchImpl: async () => Response.json({ location: { name: city + ', ' + longState + ', South Africa' } }) });
  const pages = await readFacebookLocations({ source: 'pages', access: access(), fetchImpl: async () => Response.json({ data: [{ id: '123', name: 'Long area Page', location: { city, state: longState, country: 'South Africa' } }] }) });
  for (const result of [profile, pages]) {
    assert.equal(result.status, 'available');
    assert.equal(result.locations[0].area, expected);
    assert.ok(result.locations[0].area.length <= 100);
  }
  const oversizedCity = await readFacebookLocations({ source: 'profile', access: access(), fetchImpl: async () => Response.json({ location: { name: 'X'.repeat(250) } }) });
  assert.equal(oversizedCity.locations[0].area.length, 100);
});

test('missing token or permissions never invokes Graph, and source cannot select arbitrary endpoints', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('Should not fetch'); };
  assert.equal((await readFacebookLocations({ source: 'profile', fetchImpl })).status, 'permission_required');
  assert.equal((await readFacebookLocations({ source: 'profile', access: access(['public_profile', 'email']), fetchImpl })).status, 'permission_required');
  assert.equal((await readFacebookLocations({ source: 'pages', access: access(['pages_show_list']), fetchImpl })).status, 'permission_required');
  assert.equal((await readFacebookLocations({ source: 'profile', access: { token: 'bad\r\nheader', scopes: ['user_location'] }, fetchImpl })).status, 'permission_required');
  await assert.rejects(readFacebookLocations({ source: 'https://untrusted.invalid', access: access(), fetchImpl }), /profile or pages/);
  assert.equal(calls, 0);
});

test('missing cities are distinct from malformed responses and permission failures', async () => {
  const cases = [
    ['profile', {}, 'no_location'],
    ['pages', { data: [] }, 'no_location'],
    ['profile', { location: 123 }, 'unavailable'],
    ['pages', { data: {} }, 'unavailable'],
    ['profile', { error: { code: 10, message: 'raw-token-private-error' } }, 'permission_required'],
    ['profile', { error: { code: 190, message: 'raw-token-private-error' } }, 'permission_required'],
  ];
  for (const [source, body, expected] of cases) {
    const result = await readFacebookLocations({ source, access: access(), fetchImpl: async () => Response.json(body, { status: body.error ? 400 : 200 }) });
    assert.equal(result.status, expected);
    assert.doesNotMatch(JSON.stringify(result), /raw-token-private-error|unit-only-facebook/);
    assert.deepEqual(result.locations, []);
  }
  const failed = await readFacebookLocations({ source: 'profile', access: access(), fetchImpl: async () => Response.json({ error: { message: 'Raw upstream failure' } }, { status: 503 }) });
  assert.equal(failed.status, 'unavailable');
  const malformed = await readFacebookLocations({ source: 'profile', access: access(), fetchImpl: async () => new Response('not json') });
  assert.equal(malformed.status, 'unavailable');
  const huge = await readFacebookLocations({ source: 'profile', access: access(), fetchImpl: async () => new Response('x'.repeat(140 * 1_024)) });
  assert.equal(huge.status, 'unavailable');
});

test('timeout aborts Graph access and does not leak failures, even when the fetch implementation ignores abort', async () => {
  let signal;
  const started = Date.now();
  const result = await readFacebookLocations({ source: 'profile', access: access(), timeoutMs: 20, fetchImpl: async (_url, options) => {
    signal = options.signal;
    return await new Promise(() => {});
  } });
  assert.equal(result.status, 'unavailable');
  assert.equal(signal.aborted, true);
  assert.ok(Date.now() - started < 1_000);
});

test('HTTP Facebook areas require a verified owner session; the legacy Muse token cannot authorize them', async () => {
  let tokenCalls = 0;
  let graphCalls = 0;
  await withServer({ env: { MUSE_CLIENT_TOKEN: 'legacy-preview-token' }, authService: fakeAuth({ getFacebookAccessToken: async () => { tokenCalls += 1; return access(); } }), fetchImpl: async () => { graphCalls += 1; return Response.json({ location: { name: 'Johannesburg' } }); } }, async base => {
    const route = base + '/api/facebook/location?source=profile';
    assert.equal((await fetch(route, { headers: { Authorization: 'Bearer legacy-preview-token', 'X-Muse-Owner': 'owner-1' } })).status, 401);
    assert.equal((await fetch(route, { headers: { cookie: 'valid-owner-cookie', 'X-Muse-Owner': 'other-owner' } })).status, 401);
    assert.equal((await fetch(route, { headers: { cookie: 'valid-owner-cookie' } })).status, 401);
    assert.equal((await fetch(route, { headers: { ...ownerHeaders, origin: 'https://untrusted.invalid' } })).status, 403);
    assert.equal(tokenCalls, 0);
    assert.equal(graphCalls, 0);
    assert.equal((await fetch(base + '/api/facebook/location?source=unexpected', { headers: ownerHeaders })).status, 400);
    assert.equal((await fetch(route, { method: 'POST', headers: ownerHeaders })).status, 405);
    const valid = await fetch(route, { headers: ownerHeaders });
    assert.equal(valid.status, 200);
    assert.equal(valid.headers.get('cache-control'), 'no-store');
    assert.equal((await valid.json()).locations[0].area, 'Johannesburg');
    assert.equal(tokenCalls, 1);
    assert.equal(graphCalls, 1);
  });
});

test('HTTP Facebook area permission state is clean and repeated Graph imports are rate limited', async () => {
  let graphCalls = 0;
  await withServer({ env: {}, authService: fakeAuth({ getFacebookAccessToken: async () => null }), fetchImpl: async () => { graphCalls += 1; throw new Error('No token should not fetch'); } }, async base => {
    const response = await fetch(base + '/api/facebook/location?source=profile', { headers: ownerHeaders });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'permission_required');
  });
  assert.equal(graphCalls, 0);
  await withServer({ env: {}, authService: fakeAuth(), fetchImpl: async () => Response.json({ location: { name: 'Pretoria' } }) }, async base => {
    for (let index = 0; index < 10; index++) assert.equal((await fetch(base + '/api/facebook/location?source=profile', { headers: ownerHeaders })).status, 200);
    assert.equal((await fetch(base + '/api/facebook/location?source=profile', { headers: ownerHeaders })).status, 429);
  });
});

test('real auth adapter selects only the verified owner Facebook account and decrypts its token internally', async () => {
  const service = createAuthService({ env: env(), migrate: true });
  try {
    const runtime = await service.initialize();
    assert.ok(runtime);
    const context = await runtime.auth.$context;
    const { makeSignature, symmetricEncrypt } = await import('better-auth/crypto');
    const user = await context.internalAdapter.createUser({ name: 'Unit owner', email: 'owner@unit.invalid', emailVerified: false });
    const session = await context.internalAdapter.createSession(user.id);
    const cookie = context.authCookies.sessionToken.name + '=' + encodeURIComponent(session.token + '.' + await makeSignature(session.token, env().BETTER_AUTH_SECRET));
    assert.equal(await service.getFacebookAccessToken({ cookie }), null);
    await context.internalAdapter.createAccount({ userId: user.id, providerId: 'facebook', accountId: '123456', scope: 'public_profile,email,user_location', accessToken: await symmetricEncrypt({ key: context.secretConfig, data: token }) });
    assert.deepEqual(await service.getFacebookAccessToken({ cookie }), { token, scopes: ['public_profile', 'email', 'user_location'] });
    assert.equal(await service.getFacebookAccessToken({ cookie: 'forged' }), null);
    for (const scopes of [['user_location'], ['pages_show_list', 'pages_read_engagement']]) {
      const link = await runtime.auth.handler(new Request('http://localhost:8787/api/auth/link-social', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: 'http://localhost:8083' }, body: JSON.stringify({ provider: 'facebook', scopes, callbackURL: 'http://localhost:8083/auth/callback', errorCallbackURL: 'http://localhost:8083/auth/callback', disableRedirect: true }) }));
      assert.equal(link.status, 200);
      const authorization = new URL((await link.json()).url);
      const grantedRequest = authorization.searchParams.get('scope').split(/[ ,]+/);
      assert.deepEqual(grantedRequest.sort(), [...scopes, 'public_profile'].sort(), 'optional area access must request only the baseline profile and selected area permissions');
    }
    const blockedTokenEndpoint = await runtime.auth.handler(new Request('http://localhost:8787/api/auth/get-access-token', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: 'http://localhost:8083' }, body: JSON.stringify({ accountId: 'anything' }) }));
    assert.equal(blockedTokenEndpoint.status, 404);
    await context.internalAdapter.deleteSession(session.token);
    assert.equal(await service.getFacebookAccessToken({ cookie }), null);
  } finally { await service.close(); }
});
