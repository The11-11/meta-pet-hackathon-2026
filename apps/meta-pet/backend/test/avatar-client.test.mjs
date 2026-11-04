import test from 'node:test';
import assert from 'node:assert/strict';
import { requestPetAvatar } from '../../src/petAvatarApi.ts';
import { parsePetAvatar } from '../../src/petAvatarData.ts';
import { completeOwnerSetup, freshOwnerData } from '../../src/ownerData.ts';
import { requestMuse } from '../../src/muse.ts';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
const generatedAt = '2026-10-25T12:00:00.000Z';
const avatar = { uri: `data:image/png;base64,${png}`, createdAt: generatedAt, style: 'muse-plush' };
const photo = { uri: 'file:///private/source-photo.png', mimeType: 'image/png', base64: png, exif: { location: 'do-not-send' } };
const pet = { id: 'pet-milo', name: '  Milo  ', species: 'Dog', breed: 'Retriever', age: '2 years', avatar };
const successfulResult = () => ({ mode: 'live', petId: pet.id, generatedAt, image: { mimeType: 'image/png', dataUrl: avatar.uri } });

test('avatar generation sends only the chosen photo and required pet metadata while preserving transport authorization', async context => {
  let observed;
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    observed = { url, options, body: JSON.parse(options.body) };
    return Response.json(successfulResult());
  });
  const before = JSON.stringify({ pet, photo });
  const result = await requestPetAvatar('https://muse.example///', photo, pet, 'development-token', {
    credentials: 'include', headers: { 'X-Muse-Owner': 'verified-owner', Cookie: 'signed-session-cookie' },
  });
  assert.equal(observed.url, 'https://muse.example/api/muse/avatar');
  assert.equal(observed.options.method, 'POST');
  assert.equal(observed.options.credentials, 'include');
  assert.deepEqual(observed.options.headers, {
    'Content-Type': 'application/json', 'X-Muse-Owner': 'verified-owner', Cookie: 'signed-session-cookie', Authorization: 'Bearer development-token',
  });
  assert.deepEqual(observed.body, { pet: { id: pet.id, name: 'Milo', species: 'Dog' }, photo: { mimeType: 'image/png', base64: png } });
  assert.equal(observed.options.body.includes('source-photo'), false, 'the private source URI is not server context');
  assert.equal(observed.options.body.includes('do-not-send'), false, 'photo metadata is not uploaded');
  assert.deepEqual(result, { uri: avatar.uri, createdAt: generatedAt });
  assert.equal(JSON.stringify({ pet, photo }), before, 'generation does not mutate a saved profile or selected photo');
});

test('avatar generation without explicit transport omits credentials and invented authorization', async context => {
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.credentials, 'omit');
    assert.equal(Object.hasOwn(options.headers, 'Authorization'), false);
    assert.equal(Object.hasOwn(options.headers, 'X-Muse-Owner'), false);
    return Response.json(successfulResult());
  });
  await requestPetAvatar('https://muse.example', photo, pet, '');
});

test('a disconnected avatar request does not upload the selected photo', async context => {
  let uploaded = false;
  context.mock.method(globalThis, 'fetch', async () => { uploaded = true; return Response.json(successfulResult()); });
  await assert.rejects(requestPetAvatar('', photo, pet, ''), /Connect Muse in Settings/);
  assert.equal(uploaded, false);
});

test('avatar generation rejects another pet, a demo response and malformed generated images', async context => {
  let response;
  context.mock.method(globalThis, 'fetch', async () => Response.json(response));
  const invalid = [
    { ...successfulResult(), petId: 'another-pet' },
    { ...successfulResult(), mode: 'demo' },
    { ...successfulResult(), generatedAt: 'not-a-date' },
    { ...successfulResult(), image: {} },
    { ...successfulResult(), image: { dataUrl: 'https://external.example/tracking.png' } },
    { ...successfulResult(), image: { dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' } },
    { ...successfulResult(), image: { dataUrl: 'data:image/png;base64,invalid characters!' } },
    { ...successfulResult(), image: { dataUrl: `data:image/png;base64,${'A'.repeat(12_000_000)}` } },
  ];
  for (response of invalid) await assert.rejects(requestPetAvatar('https://muse.example', photo, pet, ''), /unexpected avatar/);
  for (response of [null, [], {}]) await assert.rejects(requestPetAvatar('https://muse.example', photo, pet, ''), Error);
});

test('provider failure and aborted generation stay failures instead of becoming a fabricated avatar', async context => {
  const mockedFetch = context.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Muse Image access is not configured.' }, { status: 503 }));
  await assert.rejects(requestPetAvatar('https://muse.example', photo, pet, ''), /unavailable.*photo is still here/);
  mockedFetch.mock.mockImplementation(async () => Response.json({ error: 'Internal token configuration detail' }, { status: 401 }));
  await assert.rejects(requestPetAvatar('https://muse.example', photo, pet, ''), /Sign in to create.*continue without/);
  mockedFetch.mock.mockImplementation(async () => { throw new DOMException('Canceled', 'AbortError'); });
  await assert.rejects(requestPetAvatar('https://muse.example', photo, pet, ''), /took too long.*photo is still here/);
  mockedFetch.mock.mockImplementation(async () => { throw new TypeError('Network unavailable'); });
  await assert.rejects(requestPetAvatar('https://muse.example', photo, pet, ''), /Could not reach Muse/);
});

test('saved avatars project a bounded self-contained image and discard caller metadata', () => {
  assert.deepEqual(parsePetAvatar({ ...avatar, originalPhoto: 'do-not-persist', accessToken: 'do-not-persist' }), avatar);
  const jpeg = { ...avatar, uri: 'data:image/jpeg;base64,/9j/2Q==' };
  assert.deepEqual(parsePetAvatar(jpeg), jpeg);
  for (const invalid of [
    null, undefined, {}, { ...avatar, uri: '' },
    ...['https://external.example/avatar.png', 'http://external.example/avatar.png', 'file:///private/photo.png', 'blob:temporary-photo', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,with spaces'].map(uri => ({ ...avatar, uri })),
    { ...avatar, uri: `data:image/png;base64,${'A'.repeat(1_000_000)}` },
    { ...avatar, createdAt: 'not-a-date' }, { ...avatar, createdAt: 0 }, { ...avatar, style: 'unknown-style' },
  ]) assert.equal(parsePetAvatar(invalid), undefined);
});

test('onboarding preserves only a validated custom avatar under the existing pet identity', () => {
  const data = freshOwnerData({ mode: 'demo' }, '', 'stable-pet-id');
  const before = JSON.stringify(data);
  const setup = completeOwnerSetup(data, { ...pet, avatar: { ...avatar, originalPhoto: 'do-not-persist' } }, ['feeding', 'walk']);
  assert.equal(setup.pet.id, 'stable-pet-id');
  assert.equal(setup.pet.name, 'Milo');
  assert.deepEqual(setup.pet.avatar, avatar);
  assert.equal(setup.onboarding.completed, true);
  assert.equal(JSON.stringify(data), before);
  for (const invalid of [undefined, { ...avatar, uri: 'https://external.example/avatar.png' }, { ...avatar, createdAt: 'invalid' }]) {
    const result = completeOwnerSetup(data, { ...pet, avatar: invalid }, ['feeding']);
    assert.equal(Object.hasOwn(result.pet, 'avatar'), false, 'invalid or missing portraits must keep the honest Kai fallback');
  }
});

test('text chat never transmits saved avatar pixels or loses care context to their size', async context => {
  let observed;
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    observed = { body: JSON.parse(options.body), bytes: Buffer.byteLength(options.body, 'utf8') };
    return Response.json({ mode: 'demo', reply: 'Care records received.' });
  });
  const data = freshOwnerData({ mode: 'facebook' }, 'https://muse.example', pet.id);
  data.pet = { ...pet, avatar: { ...avatar, uri: `data:image/png;base64,${'A'.repeat(900_000)}` } };
  data.logs = [{ id: 'walk', type: 'walk', label: 'Morning walk', note: 'Owner recorded', recordedAt: generatedAt }];
  await requestMuse('Summarize care.', data, [], '');
  assert.deepEqual(observed.body.pet, { id: pet.id, name: pet.name, species: pet.species, breed: pet.breed, age: pet.age });
  assert.equal(Object.hasOwn(observed.body.pet, 'avatar'), false);
  assert.deepEqual(observed.body.logs, data.logs);
  assert.ok(observed.bytes < 1_024, 'portrait pixels must not consume the text-chat context budget');
});
