import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModelRequest, demoReply, parseChatRequest } from '../src/muse.mjs';

const payload = (changes = {}) => ({ message: 'Help with everyday care.', pet: { id: 'synthetic-kai', name: 'Kai', species: 'Dog', breed: 'Mixed breed', age: '2 years', careNeeds: 'Owner reports a food sensitivity.' }, careGoals: ['feeding', 'training'], ...changes });
const contextOf = request => JSON.parse(request.input[0].content.split('\n')[1]);
const bad = error => error.status === 400;

test('care context preserves bounded pet details and selected goals without caller metadata', () => {
  const original = payload();
  const before = JSON.stringify(original);
  const parsed = parseChatRequest({ ...original, pet: { ...original.pet, avatar: 'PRIVATE_IMAGE', apiKey: 'PRIVATE_KEY' } });
  assert.deepEqual(parsed.pet, original.pet);
  assert.deepEqual(parsed.careGoals, ['feeding', 'training']);
  const request = buildModelRequest(parsed, 'stub-model');
  assert.deepEqual(contextOf(request).pet, original.pet);
  assert.deepEqual(contextOf(request).careGoals, ['feeding', 'training']);
  assert.doesNotMatch(JSON.stringify(request), /PRIVATE_/);
  assert.equal(JSON.stringify(original), before);
});

test('care fields and goals reject oversized or malformed values instead of forwarding them', () => {
  for (const [field, limit] of [['breed', 100], ['age', 80], ['careNeeds', 500]]) {
    for (const value of [true, {}, ['text'], 'x'.repeat(limit + 1)]) {
      assert.throws(() => parseChatRequest(payload({ pet: { name: 'Kai', [field]: value } })), bad);
    }
    assert.doesNotThrow(() => parseChatRequest(payload({ pet: { name: 'Kai', [field]: 'x'.repeat(limit) } })));
  }
  for (const goals of [['walk', 'walk'], ['medication'], Array(6).fill('walk'), 'feeding', {}, [null]]) {
    assert.throws(() => parseChatRequest(payload({ careGoals: goals })), bad);
  }
  const parsed = parseChatRequest(payload({ pet: { name: 'Kai', age: ' ', breed: null }, careGoals: [] }));
  assert.deepEqual(parsed.pet, { name: 'Kai', species: 'pet' });
  assert.equal(Object.hasOwn(parsed, 'careGoals'), false);
});

test('separate social drafting strips private care details and goals before validation and again before provider construction', () => {
  const social = { id: 'selected-page', platform: 'facebook', displayName: 'Kai moments', handle: 'kai_pet', bio: '' };
  const parsed = parseChatRequest(payload({ taskPurpose: 'social_draft', socialProfiles: [social], pet: { id: 'synthetic-kai', name: 'Kai', species: 'Dog', breed: 'PRIVATE_BREED', age: {}, careNeeds: 'PRIVATE_HEALTH' }, careGoals: 'PRIVATE_GOALS' }));
  assert.deepEqual(parsed.pet, { id: 'synthetic-kai', name: 'Kai', species: 'Dog' });
  assert.equal(Object.hasOwn(parsed, 'careGoals'), false);
  const request = buildModelRequest({ ...parsed, pet: { ...parsed.pet, age: 'PRIVATE_AGE', careNeeds: 'PRIVATE_NEEDS' }, careGoals: ['PRIVATE_GOAL'] }, 'stub-model');
  assert.doesNotMatch(JSON.stringify(request), /PRIVATE_/);
  assert.deepEqual(contextOf(request).pet, parsed.pet);
  assert.equal(Object.hasOwn(contextOf(request), 'careGoals'), false);
});

test('demo guidance uses saved profile and goals while keeping feeding evidence and portions honest', () => {
  const reply = demoReply(parseChatRequest(payload({ message: 'What should I feed Kai?' }))).reply;
  assert.match(reply, /Mixed breed, 2 years/);
  assert.match(reply, /selected care focus: feeding, training/);
  assert.match(reply, /missing entry does not mean a meal was missed/);
  assert.match(reply, /cannot calculate a portion/);
  assert.match(reply, /weight, current food/);
});

test('cat activity guidance does not apply a dog walking schedule or promise monitoring', () => {
  const reply = demoReply(parseChatRequest(payload({ message: 'Help me plan exercise.', pet: { name: 'Mimi', species: 'Cat', age: '8 years' }, careGoals: ['walk'] }))).reply;
  assert.match(reply, /supervised indoor play/);
  assert.match(reply, /Outdoor walks are optional/);
  assert.doesNotMatch(reply, /must walk|every dog|monitored|minutes daily|kilomet/);
});

test('buying a collar and pillow opens shopping guidance without fictional audio or listings', () => {
  for (const message of ['Find a collar on Facebook Marketplace.', 'Buy a pet pillow.', 'No pain; find a collar on Marketplace.']) {
    const reply = demoReply(parseChatRequest(payload({ message }))).reply;
    assert.match(reply, /Open Shop/);
    assert.match(reply, /not retrieved or verified listings/);
    assert.doesNotMatch(reply, /cannot listen|cannot assess/);
  }
});

test('a real symptom or medication request takes precedence over a product search', () => {
  for (const message of ['Kai has pain; find a toy on Marketplace.', 'No pain but vomiting; buy food.', 'Buy medication for Kai.']) {
    const result = demoReply(parseChatRequest(payload({ message })));
    assert.match(result.reply, /Contact your veterinarian/);
    assert.doesNotMatch(result.reply, /Open Shop/);
    assert.deepEqual(result.proposedActions, []);
  }
});

test('training and rest guidance are practical without inferring progress or sleep duration', () => {
  const train = demoReply(parseChatRequest(payload({ message: 'Help with training.' }))).reply;
  assert.match(train, /reward-based/);
  assert.match(train, /avoid punishment/);
  assert.match(train, /Which skill/);
  const sleep = demoReply(parseChatRequest(payload({ message: 'Help with bedtime sleep.' }))).reply;
  assert.match(sleep, /quiet, comfortable resting place/);
  assert.match(sleep, /not continuous monitoring/);
});