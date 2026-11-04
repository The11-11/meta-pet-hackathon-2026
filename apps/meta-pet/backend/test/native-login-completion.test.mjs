import test from 'node:test';
import assert from 'node:assert/strict';
import { completeFacebookLogin } from '../../src/completeFacebookLogin.ts';
import { stageDemoProfileHandoff, loadDemoProfileHandoff, bindDemoProfileHandoff, DEMO_PROFILE_STORAGE_KEY, DEMO_HANDOFF_KEY } from '../../src/demoProfileHandoff.ts';

const account = { owner: { mode: 'facebook', id: 'owner-a', name: 'Owner' }, identity: 'verified-session-a' };
const demo = { pet: { id: 'local-demo', name: 'Demo Pet', species: 'Dog', breed: '', age: '' }, onboarding: { completed: true, goals: ['walk'] }, logs: [], appointments: [], rewards: [], backendUrl: '' };
async function fixture() {
  const values = new Map([[DEMO_PROFILE_STORAGE_KEY, JSON.stringify(demo)]]);
  const storage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } };
  return { storage, values, id: await stageDemoProfileHandoff(storage, demo) };
}
test('native return without a mounted callback exposes an explicit profile choice before account publication', async () => {
  const { storage, values, id } = await fixture();
  assert.equal(await loadDemoProfileHandoff(storage, account.owner.id), null);
  const selected = await completeFacebookLogin(storage, async () => account, () => true, id);
  const choice = await loadDemoProfileHandoff(storage, selected.owner.id);
  assert.equal(choice.profile.name, 'Demo Pet');
  assert.equal(values.has('muse.pet.owner.v2.facebook.owner-a'), false, 'Binding must never import the profile');
  assert.equal(await loadDemoProfileHandoff(storage, 'owner-b'), null);
  assert.ok(await bindDemoProfileHandoff(storage, id, account.owner.id), 'A subsequently mounted callback is idempotent');
});
test('expired, edited and mismatched invitations fail instead of skipping the Keep choice', async () => {
  for (const kind of ['expired', 'edited', 'mismatched']) {
    const { storage, values, id } = await fixture();
    if (kind === 'expired') { const item = JSON.parse(values.get(DEMO_HANDOFF_KEY)); item.createdAt -= 3600000; item.expiresAt -= 3600000; values.set(DEMO_HANDOFF_KEY, JSON.stringify(item)); }
    if (kind === 'edited') values.set(DEMO_PROFILE_STORAGE_KEY, JSON.stringify({ ...demo, pet: { ...demo.pet, name: 'Changed' } }));
    await assert.rejects(() => completeFacebookLogin(storage, async () => account, () => true, kind === 'mismatched' ? 'handoff-123-other' : id), /changed|expired/);
    assert.equal(values.has('muse.pet.owner.v2.facebook.owner-a'), false);
  }
});
test('unverified and changed login sessions cannot claim a pending profile', async () => {
  const { storage, id } = await fixture();
  for (const value of [{ owner: null, identity: null }, { owner: { mode: 'demo', id: 'demo.preview' }, identity: null }, { ...account, identity: null }]) {
    await assert.rejects(() => completeFacebookLogin(storage, async () => value, () => true, id), /Verify/);
  }
  await assert.rejects(() => completeFacebookLogin(storage, async () => account, () => false, id), /sign-in changed/);
  assert.equal(await loadDemoProfileHandoff(storage, account.owner.id), null);
});
test('an account switch while invitation storage is awaited never completes the previous login', async () => {
  const { storage, id } = await fixture();
  let current = true;
  const original = storage.setItem;
  storage.setItem = async (...args) => { await original(...args); current = false; };
  await assert.rejects(() => completeFacebookLogin(storage, async () => account, () => current, id), /sign-in changed/);
  assert.equal(await loadDemoProfileHandoff(storage, 'owner-b'), null);
});
test('ordinary verified sign-in and signed-out refresh do not claim an unrelated demo invitation', async () => {
  const { storage } = await fixture();
  assert.equal(await completeFacebookLogin(storage, async () => account, () => true), account);
  assert.equal(await loadDemoProfileHandoff(storage, account.owner.id), null);
  assert.deepEqual(await completeFacebookLogin(storage, async () => ({ owner: null, identity: null }), () => true), { owner: null, identity: null });
});
