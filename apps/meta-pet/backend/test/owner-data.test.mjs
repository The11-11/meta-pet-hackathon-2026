import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_OWNER, completeOwnerSetup, freshOwnerData, ownerStorageKey, parseOwner } from '../../src/ownerData.ts';

const owner = (id, name = 'Pet parent') => ({ id, name, mode: 'facebook' });
const profile = (data, changes = {}) => ({ ...data.pet, name: '  Kai  ', species: 'Dog', breed: '  Retriever  ', age: '  2 years  ', ...changes });

test('Facebook owners and the demo use separate storage, including matching IDs and encoded characters', () => {
  const owners = [owner('first-owner'), owner('second-owner'), owner(DEMO_OWNER.id), DEMO_OWNER, owner('owner/a'), owner('owner%2Fa')];
  const keys = owners.map(ownerStorageKey);
  assert.equal(new Set(keys).size, owners.length);
  const saved = new Map(owners.map((entry, index) => [ownerStorageKey(entry), JSON.stringify({ label: `private-record-${index}` })]));
  owners.forEach((entry, index) => assert.equal(JSON.parse(saved.get(ownerStorageKey(entry))).label, `private-record-${index}`));
  assert.equal(ownerStorageKey(owner('first-owner', 'Renamed parent')), keys[0], 'editing a display name must not move the owner’s saved data');
  assert.equal(ownerStorageKey(null), null, 'signed-out users must not share an owner storage namespace');
});

test('a new Facebook account starts without a pet name, care, appointments, rewards or conversation', () => {
  const data = freshOwnerData(owner('new-owner'), 'https://muse.example', 'new-pet-id');
  assert.equal(data.pet.id, 'new-pet-id');
  assert.equal(data.pet.name, '');
  assert.equal(data.pet.breed, '');
  assert.equal(data.pet.age, '');
  assert.deepEqual(data.logs, []);
  assert.deepEqual(data.appointments, []);
  assert.deepEqual(data.rewards, []);
  assert.equal(data.muse, undefined);
  assert.equal(data.onboarding.completed, false);
  assert.equal(data.backendUrl, 'https://muse.example');
  assert.equal(freshOwnerData(DEMO_OWNER, 'https://muse.example').backendUrl, '', 'demo onboarding must not silently connect to the model backend');
  assert.equal(freshOwnerData(null, 'https://muse.example').backendUrl, '');
});

test('fresh account state never reuses another account’s mutable records or goals', () => {
  const first = freshOwnerData(owner('first'), '', 'first-pet');
  const second = freshOwnerData(owner('second'), '', 'second-pet');
  first.pet.name = 'First account pet';
  first.logs.push({ id: 'care', type: 'walk', label: 'Walk', note: '', recordedAt: '2026-10-24T10:00:00Z' });
  first.rewards.push({ id: 'credit', label: 'Local test credit', amount: 5, createdAt: '2026-10-24T10:00:00Z' });
  first.onboarding.goals.push('vet');
  assert.equal(second.pet.name, '');
  assert.equal(second.logs.length, 0);
  assert.equal(second.rewards.length, 0);
  assert.equal(second.onboarding.goals.includes('vet'), false);
});

test('setup normalizes profile details and goals while keeping the stored pet identity', () => {
  const data = { ...freshOwnerData(owner('parent'), '', 'stable-pet-id'), muse: { petId: 'stable-pet-id', messages: [], decisions: {} } };
  const before = JSON.stringify(data);
  const result = completeOwnerSetup(data, profile(data, { id: 'caller-supplied-different-pet', species: 'Cat' }), ['feeding', 'walk', 'feeding', 'training']);
  assert.deepEqual(result.pet, { id: 'stable-pet-id', name: 'Kai', species: 'Cat', breed: 'Retriever', age: '2 years' });
  assert.deepEqual(result.onboarding, { completed: true, goals: ['feeding', 'walk', 'training'] });
  assert.equal(result.muse, undefined, 'a changed profile must discard suggestions prepared for its previous details');
  assert.equal(JSON.stringify(data), before, 'setup must not mutate the previous owner state');
});

test('setup rejects missing or oversized names, unsupported species and oversized profile fields', () => {
  const data = freshOwnerData(owner('parent'), '', 'pet');
  for (const invalid of [{ name: '' }, { name: '   ' }, { name: 'x'.repeat(51) }, { species: 'Unknown species' }, { breed: 'x'.repeat(81) }, { age: 'x'.repeat(41) }]) {
    assert.throws(() => completeOwnerSetup(data, profile(data, invalid), ['walk']), /pet name|profile details/);
  }
  for (const species of ['Dog', 'Cat', 'Other']) assert.equal(completeOwnerSetup(data, profile(data, { species }), ['walk']).pet.species, species);
  assert.equal(completeOwnerSetup(data, profile(data, { name: 'x'.repeat(50), breed: 'x'.repeat(80), age: 'x'.repeat(40) }), ['walk']).onboarding.completed, true);
});

test('setup requires at least one supported care goal before completing onboarding', () => {
  const data = freshOwnerData(owner('parent'), '', 'pet');
  assert.throws(() => completeOwnerSetup(data, profile(data), []), /at least one care goal/);
  assert.throws(() => completeOwnerSetup(data, profile(data), ['purchase']), /at least one care goal/);
  assert.equal(data.onboarding.completed, false);
});

test('owner parsing keeps only identity fields and ignores caller mode or credentials', () => {
  assert.deepEqual(parseOwner({ id: 'server-user-id', name: '  Alex  ', mode: 'demo', token: 'do-not-copy', email: 'private@example.com' }), { id: 'server-user-id', name: 'Alex', mode: 'facebook' });
  assert.equal(parseOwner({ id: 'server-user-id', name: 'x'.repeat(150) }).name.length, 100);
});

test('owner parsing rejects malformed records instead of assigning an account namespace', () => {
  for (const value of [null, undefined, false, 12, 'owner', [], {}, { id: 'owner' }, { id: 'owner', name: null }, { id: 'owner', name: '' }, { id: 'owner', name: '   ' }, { id: 123, name: 'Alex' }, { id: '', name: 'Alex' }, { id: '   ', name: 'Alex' }, { id: 'x'.repeat(201), name: 'Alex' }]) {
    assert.equal(parseOwner(value), null, `should reject ${JSON.stringify(value)}`);
  }
});
