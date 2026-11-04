import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData } from '../../src/data.ts';
import { completeOwnerSetup, freshOwnerData, restoreCareNeeds } from '../../src/ownerData.ts';
import { previewReply, requestMuse } from '../../src/muse.ts';

const pet = { ...initialData.pet, id: 'pet-synthetic', name: 'Milo', species: 'Cat', breed: 'Domestic shorthair', age: '7 years', careNeeds: 'Prefers quiet play and no chicken treats.' };
const data = { ...initialData, pet, backendUrl: 'https://muse.example', onboarding: { completed: true, goals: ['training', 'sleep', 'training', 'unsupported'] } };

function capture(context, response = { mode: 'live', reply: 'Synthetic reply.' }) {
  let body;
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    body = JSON.parse(options.body);
    return Response.json(response);
  });
  return () => body;
}

test('ordinary Muse context includes bounded pet care needs and unique supported goals without avatar pixels', async context => {
  const read = capture(context);
  await requestMuse('Help me plan a routine.', { ...data, pet: { ...pet, breed: 'b'.repeat(130), age: 'a'.repeat(100), careNeeds: 'n'.repeat(700), avatar: { uri: 'PRIVATE_AVATAR_PIXELS' } } }, [], '');
  const body = read();
  assert.equal(body.pet.breed.length, 100);
  assert.equal(body.pet.age.length, 80);
  assert.equal(body.pet.careNeeds.length, 500);
  assert.deepEqual(body.careGoals, ['training', 'sleep']);
  assert.equal(Object.hasOwn(body.pet, 'avatar'), false);
  assert.doesNotMatch(JSON.stringify(body), /PRIVATE_AVATAR_PIXELS/);
});

test('care preferences remain out of live social drafts, including care goals and prior chat', async context => {
  const profile = { id: 'page', platform: 'facebook', displayName: 'Milo moments', handle: 'milo', bio: 'Everyday moments.', intent: 'manage', url: 'https://facebook.com/PRIVATE_URL', createdAt: new Date().toISOString() };
  const proposedActions = [{ id: 'social', petId: pet.id, type: 'draft_social_post', expiresAt: new Date(Date.now() + 900000).toISOString(), payload: { profileId: profile.id, platform: profile.platform, petHandle: profile.handle, caption: 'Hello @milo', note: '' } }];
  const read = capture(context, { mode: 'live', reply: 'Review this draft.', proposedActions });
  await requestMuse('Draft a Facebook post.', { ...data, pet: { ...pet, breed: 'PRIVATE_BREED', age: 'PRIVATE_AGE', careNeeds: 'PRIVATE_CARE_NEEDS' }, social: { profiles: [profile], posts: [] }, logs: [{ type: 'vet', label: 'PRIVATE_LOG' }], appointments: [{ title: 'PRIVATE_APPOINTMENT' }] }, [{ id: 'previous', role: 'assistant', content: 'PRIVATE_HISTORY' }], '');
  const body = read();
  assert.deepEqual(body.pet, { id: pet.id, name: pet.name, species: pet.species });
  assert.equal(Object.hasOwn(body, 'careGoals'), false);
  assert.equal(body.taskPurpose, 'social_draft');
  assert.deepEqual(body.logs, []);
  assert.deepEqual(body.appointments, []);
  assert.deepEqual(body.history, []);
  assert.doesNotMatch(JSON.stringify(body), /PRIVATE_/);
});

test('legacy pet profiles stay valid while new care preferences survive normalized owner setup', () => {
  const fresh = freshOwnerData({ mode: 'demo' }, '', pet.id);
  const legacy = completeOwnerSetup(fresh, { ...pet, careNeeds: undefined }, ['training']);
  assert.equal(Object.hasOwn(legacy.pet, 'careNeeds'), false);
  const withNeeds = completeOwnerSetup(fresh, { ...pet, careNeeds: '  Quiet play.  ' }, ['training']);
  assert.equal(withNeeds.pet.careNeeds, 'Quiet play.');
  for (const careNeeds of ['x'.repeat(501), [], 42]) assert.throws(() => completeOwnerSetup(fresh, { ...pet, careNeeds }, ['training']), /profile details/);
  assert.equal(restoreCareNeeds('  A preference.  '), 'A preference.');
  assert.equal(restoreCareNeeds('x'.repeat(900)).length, 500);
  for (const value of [undefined, null, false, [], {}, '', '  ']) assert.equal(restoreCareNeeds(value), undefined);
});

test('local care guidance reflects cat profile and preferences while shopping stays an unverified search', () => {
  const local = { ...data, backendUrl: '' };
  const routine = previewReply('Help with a sleep routine.', local);
  assert.match(routine, /7 years/);
  assert.match(routine, /no chicken treats/);
  assert.match(routine, /indoor play/);
  const shop = previewReply('Find Facebook Marketplace toy offers.', local);
  assert.match(shop, /Open Shop/);
  assert.match(shop, /not verified offers/);
  assert.doesNotMatch(shop, /help create a page plan/);
  assert.match(previewReply('Still looking for toy offers.', local), /Open Shop/);
  assert.match(previewReply('My cat is vomiting and I want to buy medicine.', local), /contact your vet/);
});
