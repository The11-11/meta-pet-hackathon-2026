import test from 'node:test';
import assert from 'node:assert/strict';
import { persistPetProfile, queueCareWrite } from '../../src/carePersistence.ts';
import { freshOwnerData } from '../../src/ownerData.ts';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
const portrait = { uri: `data:image/png;base64,${png}`, createdAt: '2026-10-26T10:00:00.000Z', style: 'muse-plush' };
const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function profileStore(write = async () => {}) {
  let current = freshOwnerData({ mode: 'facebook' }, 'https://muse.example', 'kai-profile');
  current.pet.name = 'Kai';
  current.logs = [{ id: 'walk-before-save', type: 'walk', label: 'Morning walk', note: 'Owner recorded', recordedAt: portrait.createdAt }];
  let saved = structuredClone(current);
  let tail = Promise.resolve();
  let changes = 0;
  const attempts = [];
  const commit = next => {
    // Match the store's optimistic publication; the production queue operation
    // performs the ordered writes and keeps a failed write retryable.
    current = next;
    const result = queueCareWrite(tail, async () => {
      attempts.push(structuredClone(next));
      await write(next, attempts.length);
      saved = structuredClone(next);
    });
    tail = result.catch(() => {});
    return result;
  };
  return {
    get current() { return current; },
    get saved() { return saved; },
    get changes() { return changes; },
    attempts, commit,
    save(pet) { return persistPetProfile(current, pet, commit, () => { changes += 1; }); },
  };
}

test('an identical avatar retry persists after the first optimistic storage write fails', async () => {
  const gate = deferred();
  const store = profileStore(async (_next, attempt) => {
    if (attempt === 1) throw new Error('Device storage is unavailable');
    await gate.promise;
  });
  const pet = { ...store.current.pet, avatar: portrait };
  await assert.rejects(store.save(pet), /Device storage is unavailable/);
  assert.deepEqual(store.current.pet.avatar, portrait, 'the optimistic preview remains available to retry');
  assert.equal(store.saved.pet.avatar, undefined, 'a failed write is not a saved portrait');

  let complete = false;
  const retry = store.save(pet).then(() => { complete = true; });
  await turn();
  assert.equal(store.attempts.length, 2, 'identical values must issue another storage write');
  assert.equal(complete, false, 'the save must not report success before storage completes');
  gate.resolve();
  await retry;
  assert.deepEqual(store.saved.pet.avatar, portrait);
  assert.deepEqual(store.saved.logs, store.current.logs, 'existing care entries survive the retry');
  assert.equal(store.changes, 1, 'retrying the same portrait does not restart Muse again');
});

test('concurrent identical saves wait in order and recover after a rejected earlier write', async () => {
  const firstGate = deferred();
  const retryGate = deferred();
  const store = profileStore(async (_next, attempt) => {
    await (attempt === 1 ? firstGate.promise : retryGate.promise);
  });
  const pet = { ...store.current.pet, breed: 'Chocolate brindle' };
  const first = assert.rejects(store.save(pet), /First write failed/);
  let complete = false;
  const retry = store.save(pet).then(() => { complete = true; });
  await turn();
  assert.equal(store.attempts.length, 1, 'the second write must wait for the first');
  assert.equal(complete, false);

  firstGate.reject(new Error('First write failed'));
  await first;
  await turn();
  assert.equal(store.attempts.length, 2, 'a failed earlier write does not discard the queued retry');
  assert.equal(complete, false);
  retryGate.resolve();
  await retry;
  assert.equal(store.saved.pet.breed, 'Chocolate brindle');
  assert.equal(store.changes, 1);
});

test('an unchanged profile preserves conversation and later care entries while still awaiting persistence', async () => {
  const gate = deferred();
  const store = profileStore(async () => { await gate.promise; });
  const conversation = { petId: store.current.pet.id, backendUrl: store.current.backendUrl, messages: [] };
  store.current.muse = conversation;
  store.current.logs.push({ id: 'meal-before-retry', type: 'feeding', label: 'Breakfast', note: '', recordedAt: portrait.createdAt });
  let complete = false;
  const result = store.save({ ...store.current.pet }).then(() => { complete = true; });
  await turn();
  assert.equal(complete, false);
  assert.equal(store.current.muse, conversation);
  assert.equal(store.changes, 0, 'unchanged saves preserve the active Muse session');
  gate.resolve();
  await result;
  assert.equal(store.saved.logs.length, 2);
  assert.deepEqual(store.saved.muse, conversation);
});

test('an unchanged profile cannot bypass the owner-scope persistence guard', async () => {
  const current = freshOwnerData({ mode: 'facebook' }, 'https://muse.example', 'owner-a-pet');
  let changed = false;
  let calls = 0;
  await assert.rejects(persistPetProfile(current, { ...current.pet }, async () => {
    calls += 1;
    throw new Error('Your care profile changed');
  }, () => { changed = true; }), /Your care profile changed/);
  assert.equal(calls, 1);
  assert.equal(changed, false);
});
