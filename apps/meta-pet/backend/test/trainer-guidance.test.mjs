import test from 'node:test';
import assert from 'node:assert/strict';
import { previewReply } from '../../src/muse.ts';
import { demoReply, parseChatRequest } from '../src/muse.mjs';
const data = { pet: { id: 'trainer-demo', name: 'Kai', species: 'Dog', breed: '', age: '' }, logs: [], appointments: [], rewards: [], backendUrl: '' };

test('trainer requests mentioning Facebook go to discovery rather than social drafting', () => {
  for (const message of ['Recommend dog trainers near me using Facebook page info', 'Find puppy classes in my area', 'Find a dog behaviourist']) {
    const local = previewReply(message, data);
    assert.match(local, /Find local dog trainers/);
    assert.doesNotMatch(local, /Open Social pages|include your pet’s @handle/);
    const backend = demoReply(parseChatRequest({ ...data, message }));
    assert.match(backend.reply, /Find local dog trainers/);
    assert.deepEqual(backend.proposedActions, []);
    assert.match(backend.reply, /not verified|not live GPS/);
  }
});

test('urgent health concerns take priority over nearby trainer discovery', () => {
  const message = 'Recommend dog trainers; my dog collapsed and has breathing difficulty';
  assert.match(previewReply(message, data), /contact your vet/i);
  const result = demoReply(parseChatRequest({ ...data, message }));
  assert.match(result.reply, /prompt veterinary help/);
  assert.doesNotMatch(result.reply, /Open Find local dog trainers/);
  assert.deepEqual(result.proposedActions, []);
});
