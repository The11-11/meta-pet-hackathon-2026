import test from 'node:test';
import assert from 'node:assert/strict';
import { MUSE_TOOLS, prepareAction, tagSocialCaption } from '../src/actions.mjs';
import { buildModelRequest, demoReply, museReply, parseChatRequest } from '../src/muse.mjs';

// Synthetic profile plans only. Provider calls below use local stub functions;
// no personal social data, credentials, or external accounts are used.
const facebook = { id: 'fb-plan', platform: 'facebook', displayName: 'Milo the pet', handle: 'milo_pet', bio: '', intent: 'create', url: '' };
const instagram = { id: 'ig-plan', platform: 'instagram', displayName: 'Milo moments', handle: 'milo.moments', bio: '', intent: 'manage', url: '' };
const body = (extra = {}) => ({ message: 'Draft a Facebook post.', pet: { id: 'pet-milo', name: 'Milo', species: 'dog' }, socialProfiles: [facebook], ...extra });
const input = extra => parseChatRequest(body(extra));
const call = args => ({ type: 'function_call', name: 'prepare_social_post', arguments: JSON.stringify({ profileId: facebook.id, caption: 'A little pet-care inspiration.', note: '', ...args }) });
const invalidRequest = error => error.status === 400;

test('optional social context projects bounded profile plans and normalizes handles without retaining arbitrary metadata', () => {
  const parsed = input({ socialProfiles: [{ ...facebook, displayName: '  Milo page  ', handle: '@MiLo_PeT', bio: '  Owner-written bio  ', url: 'https://www.facebook.com/milo_pet', accountToken: 'do-not-forward', connected: true }, instagram] });
  assert.deepEqual(parsed.socialProfiles, [
    { ...facebook, displayName: 'Milo page', handle: 'milo_pet', bio: 'Owner-written bio', url: 'https://www.facebook.com/milo_pet' },
    instagram,
  ]);
  assert.deepEqual(input({ socialProfiles: undefined }).socialProfiles, []);
  assert.equal(JSON.stringify(parsed).includes('do-not-forward'), false);
  assert.equal(Object.hasOwn(parsed.socialProfiles[0], 'connected'), false);
  assert.deepEqual(input({ socialProfiles: [{ ...facebook, bio: '  ', url: '  ' }] }).socialProfiles[0], facebook);
});

test('social plans reject excessive, duplicate, malformed or cross-platform inputs', () => {
  for (const socialProfiles of [
    {}, [facebook, instagram, { ...facebook, id: 'third' }],
    [facebook, { ...instagram, id: facebook.id }], [facebook, { ...facebook, id: 'another-facebook' }],
    ...[
      { id: '' }, { id: 'x'.repeat(101) }, { platform: 'tiktok' }, { intent: 'connected' },
      { displayName: '' }, { displayName: 'x'.repeat(81) }, { handle: '' }, { handle: '.milo' },
      { handle: '@@milo' }, { handle: 'milo pet' }, { handle: 'milo/pet' }, { handle: 'x'.repeat(51) },
      { bio: 'x'.repeat(501) }, { bio: [] }, { url: 'x'.repeat(501) },
      { url: 'http://facebook.com/milo' }, { url: 'https://instagram.com/milo' },
      { url: 'https://facebook.com.evil.example/milo' }, { url: 'https://facebook.com@evil.example/milo' },
      { url: 'https://user:password@facebook.com/milo' }, { url: 'https://facebook.com:8443/milo' },
      { url: 'javascript:alert(1)' },
    ].map(change => [{ ...facebook, ...change }]),
  ]) assert.throws(() => input({ socialProfiles }), invalidRequest);
  assert.equal(input({ socialProfiles: [{ ...facebook, handle: `@${'x'.repeat(50)}` }] }).socialProfiles[0].handle.length, 50);
});

test('social tool schema is a strict draft-only contract and optional context is explicitly unconnected', () => {
  const request = buildModelRequest(input(), 'stub-model');
  assert.deepEqual(MUSE_TOOLS.map(tool => tool.name), ['prepare_care_entry', 'prepare_appointment', 'prepare_social_post']);
  const social = request.tools.find(tool => tool.name === 'prepare_social_post');
  assert.equal(social.strict, true);
  assert.equal(social.parameters.additionalProperties, false);
  assert.deepEqual(social.parameters.required, ['profileId', 'caption', 'note']);
  assert.equal(social.parameters.properties.caption.maxLength, 1800);
  assert.equal(social.parameters.properties.note.maxLength, 1000);
  const context = JSON.parse(request.input[0].content.split('\n')[1]);
  assert.deepEqual(context.socialProfiles, [{ id: facebook.id, platform: facebook.platform, displayName: facebook.displayName, handle: facebook.handle, bio: facebook.bio }]);
  assert.equal(context.socialPagesConnected, false);
  assert.equal(request.store, false);
});

test('social actions bind exact supplied profile and pet, expire, and do not mutate the source plans', () => {
  const context = input();
  const before = JSON.stringify(context);
  const now = Date.parse('2026-10-25T12:00:00Z');
  const action = prepareAction(call(), context, now);
  assert.equal(action.type, 'draft_social_post');
  assert.equal(action.petId, context.pet.id);
  assert.equal(action.expiresAt, '2026-10-25T12:15:00.000Z');
  assert.deepEqual(action.payload, { profileId: facebook.id, platform: facebook.platform, petHandle: facebook.handle, caption: 'A little pet-care inspiration.\n@milo_pet', note: '' });
  assert.equal(JSON.stringify(context), before);
  assert.throws(() => prepareAction(call({ profileId: 'invented-page' }), context), /social profile plan/);
  assert.throws(() => prepareAction(call(), input({ socialProfiles: [] })), /social profile plan/);
  assert.throws(() => prepareAction(call(), input({ pet: { name: 'Milo' } })), /Invalid action/);
});

test('pet mentions require an exact case-insensitive handle and escape punctuation', () => {
  for (const caption of ['Hello @KAI!', '(@kai) says hi', 'A note\n@kai']) assert.equal(tagSocialCaption(caption, 'kai'), caption);
  for (const caption of ['Hello @kai2', 'Hello @kai_dog', 'Hello @kai.dog', 'mailkai@kai', '@@kai', '@ka']) {
    assert.equal(tagSocialCaption(caption, 'kai'), `${caption}\n@kai`);
  }
  assert.equal(tagSocialCaption('Hello @kaixpet', 'kai.pet'), 'Hello @kaixpet\n@kai.pet');
  assert.equal(tagSocialCaption('Hello @KAI.PET!', 'kai.pet'), 'Hello @KAI.PET!');
});

test('final caption including mandatory mention and note lengths fail closed without truncation', () => {
  const context = input();
  const tagged = `${'a'.repeat(1800 - '\n@milo_pet'.length)}\n@milo_pet`;
  assert.equal(prepareAction(call({ caption: tagged }), context).payload.caption.length, 1800);
  assert.throws(() => prepareAction(call({ caption: 'a'.repeat(1800) }), context), /too long/);
  for (const args of [{ caption: '' }, { caption: 'x'.repeat(1801) }, { note: 'x'.repeat(1001) }, { note: undefined }]) {
    assert.throws(() => prepareAction(call(args), context), /Invalid action/);
  }
});

test('demo prepares a real tagged local draft while excluding private care, biography, URL and request details', () => {
  const privateText = 'PRIVATE clinic and exact location details';
  const context = input({
    message: `Draft a Facebook post. ${privateText}`,
    socialProfiles: [{ ...facebook, bio: 'PRIVATE biography text', url: 'https://facebook.com/private-page-link' }],
    logs: [{ type: 'vet', label: 'PRIVATE health observation', note: privateText }],
  });
  const before = JSON.stringify(context);
  const result = demoReply(context);
  assert.equal(result.mode, 'demo');
  assert.equal(result.proposedActions.length, 1);
  assert.equal(result.proposedActions[0].type, 'draft_social_post');
  assert.equal(result.proposedActions[0].payload.profileId, facebook.id);
  assert.match(result.proposedActions[0].payload.caption, /Meet Milo!/);
  assert.match(result.proposedActions[0].payload.caption, /\n@milo_pet$/);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|private-page-link/);
  assert.match(result.reply, /does not create a page, connect an account, or publish/);
  assert.equal(JSON.stringify(context), before);
});

test('demo asks for social setup or a precise target rather than inventing or choosing another profile', () => {
  const missing = demoReply(input({ socialProfiles: [] }));
  assert.match(missing.reply, /Social pages first/);
  assert.deepEqual(missing.proposedActions, []);
  const both = { socialProfiles: [facebook, instagram], message: 'Draft a post.' };
  assert.match(demoReply(input(both)).reply, /Which Social pages profile/);
  assert.deepEqual(demoReply(input(both)).proposedActions, []);
  const ig = demoReply(input({ ...both, message: 'Write an Instagram caption.' }));
  assert.equal(ig.proposedActions[0].payload.profileId, instagram.id);
  assert.equal(demoReply(input({ ...both, message: 'Draft a caption for @milo.moments!' })).proposedActions[0].payload.profileId, instagram.id);
  assert.deepEqual(demoReply(input({ ...both, message: 'Draft a caption for @milo_pet2' })).proposedActions, []);
  const wrongPlatform = demoReply(input({ message: 'Draft an Instagram post.' }));
  assert.match(wrongPlatform.reply, /Add that platform’s profile plan/);
  assert.deepEqual(wrongPlatform.proposedActions, []);
  assert.deepEqual(demoReply(input({ message: 'Do not draft a Facebook post.' })).proposedActions, []);
});

test('demo offers page planning and existing-page drafting without claims of account access', () => {
  for (const message of ['Can you help manage my Facebook page?', 'Help create a pet page bio.', 'Social content ideas']) {
    const result = demoReply(input({ message, socialProfiles: [] }));
    assert.match(result.reply, /plan a new pet page|existing page/);
    assert.match(result.reply, /local plans/);
    assert.deepEqual(result.proposedActions, []);
  }
  assert.match(demoReply(input({ message: 'Review training progress.' })).reply, /caption for review/);
});

test('completed live social tool output becomes an owner-reviewed draft using only one fixed Meta request', async () => {
  let providerCalls = 0;
  const result = await museReply(input(), { apiKey: 'synthetic-server-key', fetchImpl: async (url, options) => {
    providerCalls++;
    assert.equal(url, 'https://api.meta.ai/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-server-key');
    const request = JSON.parse(options.body);
    assert.equal(request.store, false);
    assert.equal(request.tools.some(tool => tool.name === 'publish_post'), false);
    return Response.json({ status: 'completed', output: [{ ...call(), status: 'completed' }] });
  } });
  assert.equal(providerCalls, 1);
  assert.equal(result.mode, 'live');
  assert.equal(result.proposedActions[0].type, 'draft_social_post');
  assert.match(result.reply, /Nothing has been saved yet/);
  assert.equal(JSON.stringify(result).includes('synthetic-server-key'), false);
});

test('invalid live social targets and overlong final captions never produce approval cards or leak provider data', async () => {
  for (const args of [{ profileId: 'nonexistent' }, { caption: 'a'.repeat(1800) }]) {
    await assert.rejects(museReply(input(), { apiKey: 'synthetic-key', fetchImpl: async () => Response.json({ output: [call(args)] }) }), error => error.status === 502 && /Social pages/.test(error.message));
  }
});
