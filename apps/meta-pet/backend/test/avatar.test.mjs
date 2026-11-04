import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { AVATAR_ENDPOINT, AVATAR_MODEL, MAX_AVATAR_BODY_BYTES, generateAvatar, parseAvatarRequest } from '../src/avatar.mjs';
import { createMuseServer } from '../src/server.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO/aDmcAAAAASUVORK5CYII=';
const input = () => ({ pet: { id: 'kai-pet', name: 'Kai', species: 'Dog' }, photo: { mimeType: 'image/png', base64: PNG } });
const generated = () => ({ status: 'completed', error: null, incomplete_details: null, output: [{ type: 'message', status: 'completed', content: [] }, { type: 'image_generation_call', status: 'completed', result: PNG }] });
const options = (response = generated()) => ({ apiKey: 'test-private-model-key', fetchImpl: async () => Response.json(response) });
const isStatus = status => error => error.status === status;

async function withServer(env, run, fetchImpl = async () => Response.json(generated())) {
  const server = createMuseServer({ env, fetchImpl });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const request = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-device-token' }, body: JSON.stringify(body) });

test('avatar request projects profile and photo fields and validates PNG/JPEG dimensions', () => {
  const value = input(); value.pet.token = 'ignored'; value.photo.url = 'http://127.0.0.1/private';
  const parsed = parseAvatarRequest(value);
  assert.deepEqual(parsed.pet, { id: 'kai-pet', name: 'Kai', species: 'Dog' });
  assert.deepEqual(parsed.photo, { mimeType: 'image/png', base64: PNG, width: 1, height: 1 });
  // Structural JPEG fixture: metadata parsing does not decompress photo pixels.
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 1, 0xff, 0xd9]);
  value.photo = { mimeType: 'image/jpeg', base64: jpeg.toString('base64') };
  assert.equal(parseAvatarRequest(value).photo.width, 1);
  assert.equal(parseAvatarRequest(value).photo.height, 1);
});

test('avatar rejects URLs, mismatched MIME, corrupt files, oversized photos and excessive pixels', () => {
  for (const photo of [
    { mimeType: 'image/svg+xml', base64: PNG },
    { mimeType: 'image/jpeg', base64: PNG },
    { mimeType: 'image/png', base64: 'https://example.com/pet.png' },
    { mimeType: 'image/png', base64: `data:image/png;base64,${PNG}` },
    { mimeType: 'image/png', base64: Buffer.from('not an image').toString('base64') },
    { mimeType: 'image/png', base64: 'A'.repeat(Math.ceil((2 * 1024 * 1024) / 3) * 4 + 4) },
  ]) assert.throws(() => parseAvatarRequest({ ...input(), photo }), isStatus(400));
  const huge = Buffer.from(PNG, 'base64'); huge.writeUInt32BE(8192, 16); huge.writeUInt32BE(8192, 20);
  assert.throws(() => parseAvatarRequest({ ...input(), photo: { mimeType: 'image/png', base64: huge.toString('base64') } }), /16 million pixels/);
  for (const pet of [{ id: '', name: 'Kai', species: 'Dog' }, { id: 'pet', name: '', species: 'Dog' }, { id: 'pet', name: 'Kai', species: 'unsupported' }]) assert.throws(() => parseAvatarRequest({ ...input(), pet }), isStatus(400));
});

test('avatar uses the documented fixed Meta image request and returns only an actual validated image', async () => {
  let observed;
  const response = await generateAvatar(input(), { ...options(), fetchImpl: async (url, settings) => {
    observed = { url, ...settings, body: JSON.parse(settings.body) };
    return Response.json(generated());
  } });
  assert.equal(observed.url, AVATAR_ENDPOINT);
  assert.equal(observed.redirect, 'error');
  assert.equal(observed.headers.Authorization, 'Bearer test-private-model-key');
  assert.equal(observed.body.model, AVATAR_MODEL);
  assert.equal(observed.body.store, false);
  assert.equal(observed.body.input[0].content[1].image_url, `data:image/png;base64,${PNG}`);
  assert.match(observed.body.input[0].content[0].text, /upright plush body/);
  assert.deepEqual(observed.body.tools[0], { type: 'image_generation', enable_image_search: false, enable_web_search: false, enable_shell: false, reasoning_strength: 'low', size: '1024x1024', output_format: 'png' });
  assert.ok(observed.signal instanceof AbortSignal);
  assert.equal(response.mode, 'live');
  assert.equal(response.petId, 'kai-pet');
  assert.deepEqual(response.image, { mimeType: 'image/png', dataUrl: `data:image/png;base64,${PNG}`, width: 1, height: 1 });
  assert.equal(JSON.stringify(response).includes('test-private-model-key'), false);
});

test('missing model key never fabricates a personalized avatar or calls the provider', async () => {
  let called = false;
  await assert.rejects(generateAvatar(input(), { fetchImpl: async () => { called = true; return Response.json(generated()); } }), isStatus(503));
  assert.equal(called, false);
  await withServer({}, async url => {
    const response = await fetch(`${url}/api/muse/avatar`, request(input()));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).image, undefined);
  });
});

test('avatar failures, missing images, URL results and unfinished image generation remain errors', async () => {
  const responses = [
    { ...generated(), status: 'incomplete' },
    { ...generated(), error: { message: 'private-provider-debug' } },
    { ...generated(), output: [{ type: 'message', content: [{ type: 'output_text', text: 'Your avatar is ready' }] }] },
    { ...generated(), output: [{ type: 'image_generation_call', status: 'in_progress', result: PNG }] },
    { ...generated(), output: [{ type: 'image_generation_call', status: 'completed', result: 'https://private.example/image.png' }] },
    { ...generated(), output: [{ type: 'image_generation_call', status: 'completed', result: Buffer.from('bad PNG').toString('base64') }] },
  ];
  for (const response of responses) {
    let calls = 0;
    await assert.rejects(generateAvatar(input(), { ...options(), fetchImpl: async url => {
      assert.equal(url, AVATAR_ENDPOINT); calls += 1; return Response.json(response);
    } }), error => error.status === 502 && !error.message.includes('private-provider-debug'));
    assert.equal(calls, 1, 'result URLs must never trigger another server fetch');
  }
});

test('avatar provider failures and timeouts return safe errors', async () => {
  for (const [status, expected] of [[401, 503], [403, 503], [429, 503], [500, 502], [504, 504]]) {
    await assert.rejects(generateAvatar(input(), { ...options(), fetchImpl: async () => new Response('private-provider-debug', { status }) }), error => error.status === expected && !error.message.includes('private-provider-debug'));
  }
  await assert.rejects(generateAvatar(input(), { ...options(), fetchImpl: async () => new Response('{}', { headers: { 'content-length': String(13 * 1024 * 1024) } }) }), /too large/);
  const keepAlive = setTimeout(() => {}, 100);
  try {
    await assert.rejects(generateAvatar(input(), { ...options(), timeoutMs: 5, fetchImpl: async (_url, settings) => new Promise((_resolve, reject) => settings.signal.addEventListener('abort', () => reject(settings.signal.reason), { once: true })) }), isStatus(504));
  } finally { clearTimeout(keepAlive); }
});

test('avatar HTTP route requires authentication, supports bounded photo JSON and preserves chat limits', async () => {
  let calls = 0;
  const env = { MODEL_API_KEY: 'test-server-key', MUSE_CLIENT_TOKEN: 'test-device-token' };
  await withServer(env, async url => {
    const unsigned = request(input()); delete unsigned.headers.Authorization;
    assert.equal((await fetch(`${url}/api/muse/avatar`, unsigned)).status, 401);
    assert.equal(calls, 0);
    const response = await fetch(`${url}/api/muse/avatar`, request(input()));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).image.mimeType, 'image/png');
    assert.equal(calls, 1);
    const oversized = { ...input(), padding: 'x'.repeat(MAX_AVATAR_BODY_BYTES) };
    assert.equal((await fetch(`${url}/api/muse/avatar`, request(oversized))).status, 413);
    assert.equal(calls, 1);
    assert.equal((await fetch(`${url}/api/muse/chat`, request({ message: 'x'.repeat(65 * 1024), pet: { name: 'Kai' } }))).status, 413);
  }, async () => { calls += 1; return Response.json(generated()); });
});
