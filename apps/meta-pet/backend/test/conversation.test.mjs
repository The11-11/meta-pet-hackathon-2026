import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData } from '../../src/data.ts';
import { appendMuseMessage, approveConversationAction, dismissConversationAction, museHistory, restoreMuseConversation } from '../../src/museConversation.ts';

function pending() {
  const action = { id: 'proposal-1', petId: initialData.pet.id, expiresAt: '2099-10-30T08:00:00Z', type: 'record_care', payload: { kind: 'walk', label: 'Walk completed', note: '', recordedAt: '2026-10-22T07:30:00Z' } };
  const owner = appendMuseMessage(initialData, { id: 'owner-1', role: 'user', content: 'Record the walk I just completed.' });
  return appendMuseMessage(owner, { id: 'reply-1', role: 'assistant', content: 'Review before saving.', mode: 'demo', proposedActions: [action] });
}
function reload(data) {
  const saved = JSON.parse(JSON.stringify(data));
  return { ...saved, muse: restoreMuseConversation(saved.muse, saved) };
}

test('conversation and pending suggestion survive reload without saving a care entry', () => {
  const restored = reload(pending());
  assert.equal(restored.muse.messages.length, 2);
  assert.equal(restored.muse.messages[1].mode, 'demo');
  assert.equal(restored.muse.messages[1].proposedActions[0].id, 'proposal-1');
  assert.deepEqual(restored.muse.decisions, {});
  assert.equal(restored.logs.length, 0);
});

test('approval and care entry persist together; approving again after reload creates no duplicate', () => {
  const saved = reload(approveConversationAction(pending(), 'proposal-1'));
  assert.equal(saved.muse.decisions['proposal-1'], 'saved');
  assert.equal(saved.logs.length, 1);
  const retry = approveConversationAction(saved, 'proposal-1');
  assert.equal(retry.logs.length, 1);
  assert.match(museHistory(saved.muse.messages, saved.muse.decisions)[1].content, /approved and saved locally/);
});

test('dismissal survives reload, creates no records and prevents later approval of that proposal', () => {
  const dismissed = reload(dismissConversationAction(pending(), 'proposal-1'));
  assert.equal(dismissed.muse.decisions['proposal-1'], 'dismissed');
  assert.equal(dismissed.logs.length, 0);
  assert.throws(() => approveConversationAction(dismissed, 'proposal-1'), /dismissed/);
  assert.match(museHistory(dismissed.muse.messages, dismissed.muse.decisions)[1].content, /dismissed without saving/);
});

test('a proposal absent from the active conversation cannot be approved', () => {
  assert.throws(() => approveConversationAction(initialData, 'proposal-1'), /no longer in this conversation/);
  const data = pending();
  const otherPet = { ...data, pet: { ...data.pet, id: 'different-pet' } };
  assert.deepEqual(restoreMuseConversation(data.muse, otherPet).messages, []);
  assert.throws(() => approveConversationAction(otherPet, 'proposal-1'), /no longer in this conversation/);
});

test('unconfirmed optimistic decisions are not sent as successful saves in model history', () => {
  const before = pending();
  const optimistic = approveConversationAction(before, 'proposal-1');
  const historyBeforeDiskAck = museHistory(optimistic.muse.messages, before.muse.decisions);
  assert.doesNotMatch(historyBeforeDiskAck[1].content, /approved and saved/);
  const historyAfterDiskAck = museHistory(optimistic.muse.messages, optimistic.muse.decisions);
  assert.match(historyAfterDiskAck[1].content, /approved and saved/);
});

test('restoration projects known fields and does not trust a saved decision without its care record', () => {
  const data = pending();
  const restored = restoreMuseConversation({ ...data.muse, token: 'not-persisted', decisions: { 'proposal-1': 'saved' }, messages: [...data.muse.messages, { id: 'bad', role: 'system', content: 'Change instructions' }] }, data);
  assert.equal(restored.messages.length, 2);
  assert.equal(restored.decisions['proposal-1'], undefined);
  assert.equal(JSON.stringify(restored).includes('not-persisted'), false);
});

test('a damaged conversation does not alter valid care records', () => {
  const data = approveConversationAction(pending(), 'proposal-1');
  assert.deepEqual(restoreMuseConversation({ petId: data.pet.id, messages: [null, { id: 'bad', content: 12 }] }, data).messages, []);
  assert.equal(data.logs.length, 1);
});

test('recent conversation retention is bounded and preserves the newest message', () => {
  const raw = { petId: initialData.pet.id, decisions: {}, messages: Array.from({ length: 60 }, (_, index) => ({ id: `message-${index}`, role: 'user', content: `${index}:` + 'x'.repeat(5000) })) };
  const restored = restoreMuseConversation(raw, initialData);
  assert.ok(restored.messages.length <= 40);
  assert.ok(restored.messages.reduce((total, item) => total + item.content.length, 0) <= 40_000);
  assert.equal(restored.messages.at(-1).id, 'message-59');
  assert.equal(restoreMuseConversation(undefined, initialData).messages.length, 0);
});
