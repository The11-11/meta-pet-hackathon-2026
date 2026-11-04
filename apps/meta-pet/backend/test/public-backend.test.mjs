import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, parse, resolve, sep } from 'node:path';
import { createMuseServer, readMemoryRoot } from '../src/server.mjs';
import { createPageMemoryStore } from '../src/memory.mjs';

// All identities, records, credentials and model replies here are disposable fixtures.
const body = { message: 'Summarize this test pet.', pet: { name: 'Fixture dog', species: 'dog' }, logs: [] };
const headers = owner => ({ cookie: 'fixture=' + owner, 'x-muse-owner': owner });
const auth = () => ({
  webOrigins: [],
  async getConfig() { return { available: true }; },
  async getSession(h) {
    const owner = h.cookie === 'fixture=owner-a' ? 'owner-a' : h.cookie === 'fixture=owner-b' ? 'owner-b' : null;
    return owner ? { session: { id: 'fixture-session-' + owner }, user: { id: owner } } : null;
  },
  async close() {},
});
const reply = () => Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Fixture care guidance.' }] }] });
async function withServer(options, run) {
  const server = createMuseServer({ env: {}, authService: auth(), ...options });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await run('http://127.0.0.1:' + server.address().port); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const post = (base, path = '/api/muse/chat', data = body, h = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(data) });

test('explicit memory roots reject ambiguous locations and preserve the default when unset', () => {
  assert.equal(readMemoryRoot({}), undefined);
  const location = join(tmpdir(), 'fixture-public-memory');
  assert.equal(readMemoryRoot({ MUSE_MEMORY_ROOT: location }), resolve(location));
  for (const value of ['', '  ', 'relative/memory', '.', parse(resolve(tmpdir())).root, 'https://example.invalid/memory', 'bad\0path', 123]) {
    assert.throws(() => readMemoryRoot({ MUSE_MEMORY_ROOT: value }), /absolute non-root directory/);
  }
});

test('server-configured memory stays isolated and survives a server restart', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'muse-public-config-test-'));
  const local = createPageMemoryStore({ root: join(temporary, 'local') });
  const publicRoot = join(temporary, 'public');
  const pet = { id: 'fixture-pet', name: 'Fixture dog', species: 'dog' };
  try {
    const prior = await local.beginTurn('owner-a', pet.id, { message: 'Remember local-only fixture.', pet }); await prior.commit();
    const localBefore = await local.read('owner-a', pet.id);
    const env = { MUSE_MEMORY_ROOT: publicRoot };
    await withServer({ env }, async base => {
      const r = await post(base, '/api/muse/chat', { ...body, pet, message: 'Remember public-only fixture.' }, headers('owner-a'));
      assert.equal(r.status, 200); assert.equal((await r.json()).memory.saved, true);
    });
    assert.deepEqual(await local.read('owner-a', pet.id), localBefore);
    await withServer({ env }, async base => {
      const r = await fetch(base + '/api/muse/memory?petId=' + pet.id, { headers: headers('owner-a') });
      const page = await r.json(); assert.equal(r.status, 200); assert.equal(page.exists, true);
      assert.match(page.markdown, /public-only fixture/); assert.doesNotMatch(page.markdown, /local-only fixture/);
      const other = await fetch(base + '/api/muse/memory?petId=' + pet.id, { headers: headers('owner-b') });
      assert.equal((await other.json()).exists, false);
    });
  } finally {
    const checked = resolve(temporary);
    assert.ok(checked.startsWith(resolve(tmpdir()) + sep) && basename(checked).startsWith('muse-public-config-test-'));
    await rm(checked, { recursive: true, force: true });
  }
});

test('production Muse endpoints require the bound Facebook session even with a valid development token', async () => {
  let calls = 0;
  const env = { NODE_ENV: 'production', MODEL_API_KEY: 'fixture-provider-key', MUSE_CLIENT_TOKEN: 'fixture-device-token' };
  await withServer({ env, fetchImpl: async () => { calls++; return reply(); } }, async base => {
    for (const path of ['/api/muse/chat', '/api/muse/check', '/api/muse/avatar']) {
      assert.equal((await post(base, path)).status, 401);
      assert.equal((await post(base, path, body, { authorization: 'Bearer fixture-device-token' })).status, 401);
      assert.equal((await post(base, path, body, { ...headers('owner-a'), 'x-muse-owner': 'owner-b', authorization: 'Bearer fixture-device-token' })).status, 401);
    }
    assert.equal(calls, 0);
    const valid = await post(base, '/api/muse/chat', body, headers('owner-a'));
    assert.equal(valid.status, 200); assert.equal((await valid.json()).mode, 'live'); assert.equal(calls, 1);
  });
});

test('verified owners behind one socket receive separate care and avatar quotas', async () => {
  await withServer({ env: { MODEL_API_KEY: 'fixture-provider-key' }, fetchImpl: reply }, async base => {
    for (let i = 0; i < 30; i++) assert.equal((await post(base, '/api/muse/chat', body, headers('owner-a'))).status, 200);
    assert.equal((await post(base, '/api/muse/chat', body, headers('owner-a'))).status, 429);
    assert.equal((await post(base, '/api/muse/chat', body, headers('owner-b'))).status, 200);
    for (let i = 0; i < 3; i++) assert.equal((await post(base, '/api/muse/avatar', {}, headers('owner-a'))).status, 400);
    assert.equal((await post(base, '/api/muse/avatar', {}, headers('owner-a'))).status, 429);
    assert.equal((await post(base, '/api/muse/avatar', {}, headers('owner-b'))).status, 400);
    assert.equal((await post(base, '/api/muse/chat', body, headers('owner-b'))).status, 200);
  });
});

test('unauthenticated development quotas cannot be reset with forwarded IP headers', async () => {
  await withServer({}, async base => {
    for (let i = 0; i < 30; i++) assert.equal((await post(base)).status, 200);
    for (const key of ['x-forwarded-for', 'cf-connecting-ip', 'x-muse-remote-address']) {
      assert.equal((await post(base, '/api/muse/chat', body, { [key]: '203.0.113.99' })).status, 429);
    }
  });
});
