import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModelRequest, demoReply, museReply, parseChatRequest } from '../src/muse.mjs';

// Only synthetic profile metadata and a stub provider are used in this suite.
const profile = { id: 'selected-page', platform: 'instagram', displayName: 'Milo moments', handle: '@MiLo', bio: 'A public page about everyday adventures.' };
const request = (extra = {}) => ({ taskPurpose: 'social_draft', message: 'Make the caption playful and welcoming.', pet: { id: 'pet-milo', name: 'Milo', species: 'dog' }, socialProfiles: [profile], ...extra });
const context = model => JSON.parse(model.input[0].content.split('\n')[1]);
const bad = error => error.status === 400;
const socialCall = { type: 'function_call', name: 'prepare_social_post', arguments: JSON.stringify({ profileId: profile.id, caption: 'Everyday adventures with Milo!', note: '' }) };

test('minimal consented page context accepts omitted local setup fields and preserves the task discriminator', () => {
  const parsed = parseChatRequest(request());
  assert.equal(parsed.taskPurpose, 'social_draft');
  assert.deepEqual(parsed.socialProfiles, [{ ...profile, handle: 'milo', intent: 'manage', url: '' }]);
  assert.deepEqual(parsed.logs, []);
  assert.deepEqual(parsed.appointments, []);
  assert.deepEqual(parsed.history, []);
  assert.equal(Object.hasOwn(parseChatRequest(request({ taskPurpose: undefined })), 'taskPurpose'), false);
});

test('unknown task purposes, ambiguous selections and invalid supplied optional metadata fail validation', () => {
  for (const taskPurpose of ['', null, true, {}, 'care', 'social_publish']) assert.throws(() => parseChatRequest(request({ taskPurpose })), bad);
  for (const socialProfiles of [[], [profile, { ...profile, id: 'another', platform: 'facebook' }]]) assert.throws(() => parseChatRequest(request({ socialProfiles })), bad);
  assert.throws(() => parseChatRequest(request({ pet: { name: 'Milo' } })), bad);
  for (const change of [{ intent: null }, { intent: 'publish' }, { url: 'http://instagram.com/milo' }, { url: 'https://facebook.com/milo' }]) {
    assert.throws(() => parseChatRequest(request({ socialProfiles: [{ ...profile, ...change }] })), bad);
  }
});

test('social tasks discard care records and prior conversation before validation or provider serialization', async () => {
  const parsed = parseChatRequest(request({
    logs: [{ type: 'vet', label: 'PRIVATE_HEALTH', note: 'PRIVATE_LOCATION' }],
    appointments: [{ title: 'PRIVATE_CLINIC', date: 'not-even-a-valid-date' }],
    history: [{ role: 'system', content: 'PRIVATE_PREVIOUS_CHAT' }],
  }));
  assert.deepEqual(parsed.logs, []);
  assert.deepEqual(parsed.appointments, []);
  assert.deepEqual(parsed.history, []);
  // Ignoring these fields is deliberate rather than making a stale client fail
  // validation and tempt it to retry with the previous care conversation.
  assert.doesNotThrow(() => parseChatRequest(request({ logs: {}, appointments: 'old data', history: null })));
  let observed;
  await museReply(parsed, { apiKey: 'synthetic-test-key', fetchImpl: async (_url, options) => {
    observed = JSON.parse(options.body);
    return Response.json({ status: 'completed', output: [socialCall] });
  } });
  assert.equal(observed.input.length, 2);
  assert.deepEqual(context(observed).logs, []);
  assert.deepEqual(context(observed).appointments, []);
  assert.equal(observed.input.at(-1).content, parsed.message);
  assert.doesNotMatch(JSON.stringify(observed), /PRIVATE_HEALTH|PRIVATE_LOCATION|PRIVATE_CLINIC|PRIVATE_PREVIOUS_CHAT/);
});

test('provider context contains only selected approved page fields and omits URLs and setup intent in every task', () => {
  for (const taskPurpose of ['social_draft', undefined]) {
    const parsed = parseChatRequest(request({ taskPurpose, socialProfiles: [{ ...profile, intent: 'create', url: 'https://instagram.com/URL_MUST_STAY_LOCAL', accountSecret: 'PRIVATE_ACCOUNT_SECRET' }] }));
    const model = buildModelRequest(parsed, 'stub-model');
    assert.deepEqual(context(model).socialProfiles, [{ id: profile.id, platform: profile.platform, displayName: profile.displayName, handle: 'milo', bio: profile.bio }]);
    assert.doesNotMatch(JSON.stringify(model), /URL_MUST_STAY_LOCAL|PRIVATE_ACCOUNT_SECRET/);
    assert.equal(Object.hasOwn(context(model).socialProfiles[0], 'intent'), false);
    assert.equal(Object.hasOwn(context(model).socialProfiles[0], 'url'), false);
  }
});

test('provider construction re-enforces privacy even if a caller bypasses parsed empty context', () => {
  const parsed = parseChatRequest(request());
  const model = buildModelRequest({
    ...parsed,
    pet: { ...parsed.pet, avatar: 'PRIVATE_AVATAR', healthNotes: 'PRIVATE_PET_NOTES' },
    logs: [{ type: 'vet', note: 'PRIVATE_LOG' }], appointments: [{ title: 'PRIVATE_APPOINTMENT' }], history: [{ role: 'assistant', content: 'PRIVATE_HISTORY' }],
    socialProfiles: [{ ...parsed.socialProfiles[0], intent: 'create', url: 'https://instagram.com/PRIVATE_URL' }],
  }, 'stub-model');
  assert.doesNotMatch(JSON.stringify(model), /PRIVATE_/);
  assert.deepEqual(context(model).pet, { id: 'pet-milo', name: 'Milo', species: 'dog' });
  assert.deepEqual(model.tools.map(tool => tool.name), ['prepare_social_post']);
  assert.equal(context(model).taskPurpose, 'social_draft');
  assert.match(model.instructions, /public bio/);
  assert.match(model.instructions, /Do not invent milestones/);
  assert.match(model.instructions, /Use prepare_social_post/);
  assert.throws(() => buildModelRequest({ ...parsed, socialProfiles: [] }, 'stub-model'), bad);
});

test('live social tasks reject non-social tool output instead of preparing care changes', async () => {
  const care = { type: 'function_call', name: 'prepare_care_entry', arguments: JSON.stringify({ kind: 'walk', label: 'Unrelated walk', note: '', recordedAt: new Date().toISOString() }) };
  await assert.rejects(museReply(parseChatRequest(request()), { apiKey: 'synthetic-key', fetchImpl: async () => Response.json({ output: [care] }) }), error => error.status === 502 && /valid action details/.test(error.message));
});

test('an explicit social task prepares a starter draft for freeform guidance without a key', () => {
  const result = demoReply(parseChatRequest(request()));
  assert.equal(result.mode, 'demo');
  assert.equal(result.proposedActions[0].type, 'draft_social_post');
  assert.equal(result.proposedActions[0].payload.profileId, profile.id);
  assert.match(result.proposedActions[0].payload.caption, /\n@milo$/);
  assert.match(result.reply, /does not create a page, connect an account, or publish/);
});
