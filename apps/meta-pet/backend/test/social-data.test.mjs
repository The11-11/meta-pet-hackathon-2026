import test from 'node:test';
import assert from 'node:assert/strict';
import { freshOwnerData } from '../../src/ownerData.ts';
import { normalizePetHandle, restoreSocialState, saveSocialProfileData, updateSocialPostData, withPetMention } from '../../src/socialData.ts';
import { applyApprovedMuseAction, parseMuseAction } from '../../src/museActions.ts';
import { appendMuseMessage, approveConversationAction, dismissConversationAction, museHistory, restoreMuseConversation } from '../../src/museConversation.ts';
import { isLocalSocialDraftRequest, isSocialDraftRequest, requestMuse } from '../../src/muse.ts';
import { parseChatRequest } from '../src/muse.mjs';

const NOW = Date.parse('2026-10-25T12:00:00.000Z');
const createdAt = new Date(NOW).toISOString();
const profile = (extra = {}) => ({ id: 'instagram-kai', platform: 'instagram', displayName: 'Kai the dog', handle: 'kai', bio: 'Everyday moments', intent: 'manage', url: 'https://www.instagram.com/kai/', createdAt, ...extra });
const post = (extra = {}) => ({ id: 'saved-post', profileId: 'instagram-kai', platform: 'instagram', petHandle: 'kai', caption: 'A little adventure with @kai!', note: 'Owner-reviewed draft', createdAt, ...extra });
const pageInput = (extra = {}) => { const { id: _id, createdAt: _createdAt, ...details } = profile(extra); return details; };
function care(extra = {}) {
  const data = freshOwnerData({ mode: 'demo' }, '', 'pet-kai');
  return { ...data, pet: { ...data.pet, name: 'Kai' }, social: { profiles: [profile()], posts: [] }, ...extra };
}
const action = (extra = {}) => ({ id: 'social-proposal', petId: 'pet-kai', expiresAt: new Date(NOW + 900_000).toISOString(), type: 'draft_social_post', payload: { profileId: 'instagram-kai', platform: 'instagram', petHandle: 'kai', caption: 'An everyday moment.', note: 'Review before saving.' }, ...extra });
function pending(data = care(), proposal = action()) {
  return appendMuseMessage(data, { id: 'muse-social-reply', role: 'assistant', mode: 'demo', content: 'Review this draft.', proposedActions: [proposal] });
}

test('fresh owners have no saved social identity or drafts and never share mutable social data', () => {
  const first = freshOwnerData({ mode: 'facebook' }, 'https://muse.example', 'pet-one');
  const second = freshOwnerData({ mode: 'facebook' }, 'https://muse.example', 'pet-two');
  assert.deepEqual(restoreSocialState(first.social), { profiles: [], posts: [] });
  assert.deepEqual(restoreSocialState(second.social), { profiles: [], posts: [] });
  const updated = saveSocialProfileData(first, pageInput(), undefined, NOW);
  assert.equal(updated.social.profiles.length, 1);
  assert.deepEqual(restoreSocialState(second.social), { profiles: [], posts: [] });
});

test('handles normalize consistently and invalid or oversized handles are rejected', () => {
  assert.equal(normalizePetHandle('  @Kai.Dog_01  '), 'kai.dog_01');
  assert.equal(normalizePetHandle('KAI'), 'kai');
  assert.equal(normalizePetHandle(`@${'a'.repeat(50)}`), 'a'.repeat(50));
  for (const invalid of [null, undefined, 12, '', '   ', '@', '@@kai', '.kai', 'kai pet', 'kai-pet', 'https://instagram.com/kai', 'a'.repeat(51)]) {
    assert.throws(() => normalizePetHandle(invalid));
  }
});

test('every draft includes its own exact handle without duplicating a case-insensitive valid mention', () => {
  assert.equal(withPetMention('  Hello world  ', '@Kai'), 'Hello world\n\n@kai');
  for (const caption of ['@KAI says hello', 'Hello, @Kai!', 'Meet (@kai)']) assert.equal(withPetMention(caption, 'kai'), caption);
  for (const caption of ['Hello @kai2', 'Hello @kai.dog', 'Hello @kai_dog', 'email@kai', '@@kai', '.@kai']) {
    assert.equal(withPetMention(caption, 'kai'), `${caption}\n\n@kai`, `must not mistake ${caption} for the pet's exact mention`);
  }
  assert.equal(withPetMention('Meet @KAI.DOG!', 'kai.dog'), 'Meet @KAI.DOG!');
  assert.equal(withPetMention('Meet @kaiXdog', 'kai.dog'), 'Meet @kaiXdog\n\n@kai.dog', 'dots in handles must be escaped in matching');
  assert.throws(() => withPetMention('a'.repeat(1_800), 'kai'), /room|Shorten/);
  const fullCaption = `${'a'.repeat(1_795)} @kai`;
  assert.equal(withPetMention(fullCaption, 'kai'), fullCaption);
});

test('restoration projects known fields, limits platforms and drops damaged or mismatched social records', () => {
  const source = {
    token: 'discard-private-token',
    profiles: [null, profile({ token: 'discard-private-token' }), profile({ id: 'duplicate-platform' }), profile({ id: 'bad-platform', platform: 'tiktok' }), profile({ id: 'bad-date', platform: 'facebook', createdAt: 'invalid' }), profile({ id: 'facebook-kai', platform: 'facebook', url: 'https://www.facebook.com/kai' })],
    posts: [null, post({ token: 'discard-private-token' }), post(), post({ id: 'orphan', profileId: 'missing' }), post({ id: 'wrong-platform', platform: 'facebook' }), post({ id: 'stale-handle', petHandle: 'another_pet' }), post({ id: 'bad-date', createdAt: 'invalid' }), post({ id: 'bad-caption', caption: '' }), post({ id: 'bad-note', note: 12 })],
  };
  const restored = restoreSocialState(source);
  assert.equal(restored.profiles.length, 2);
  assert.equal(restored.posts.length, 1);
  assert.deepEqual(restored.posts[0], post());
  assert.equal(JSON.stringify(restored).includes('discard-private-token'), false);
  for (const value of [undefined, null, 12, 'corrupted', { profiles: 'bad', posts: {} }]) assert.deepEqual(restoreSocialState(value), { profiles: [], posts: [] });
  const many = restoreSocialState({ profiles: [profile()], posts: Array.from({ length: 80 }, (_, index) => post({ id: `post-${index}` })) });
  assert.equal(many.posts.length, 50);
});

test('profile saving rejects unsupported services, malformed fields, deceptive URLs and stale IDs', () => {
  for (const invalid of [
    null, {}, pageInput({ platform: 'tiktok' }), pageInput({ intent: 'publish' }), pageInput({ displayName: '' }), pageInput({ displayName: 'a'.repeat(81) }), pageInput({ bio: 'a'.repeat(501) }), pageInput({ handle: '@@kai' }),
    ...['http://instagram.com/kai', 'https://instagram.com.evil.example/kai', 'https://facebook.com/kai', 'https://person:password@instagram.com/kai', 'https://instagram.com:444/kai'].map(url => pageInput({ url })),
  ]) assert.throws(() => saveSocialProfileData(care(), invalid, undefined, NOW));
  assert.throws(() => saveSocialProfileData(care(), pageInput(), 'missing-profile', NOW), /changed|details/);
  assert.throws(() => saveSocialProfileData(care(), pageInput({ platform: 'facebook', url: 'https://www.facebook.com/kai' }), 'instagram-kai', NOW), /platform|separate page/);
  const updated = saveSocialProfileData(care(), pageInput({ handle: '@KAI', displayName: '  Kai  ', token: 'discard' }), 'instagram-kai', NOW + 1);
  assert.equal(updated.social.profiles.length, 1);
  assert.equal(updated.social.profiles[0].id, 'instagram-kai');
  assert.equal(updated.social.profiles[0].createdAt, createdAt);
  assert.equal(updated.social.profiles[0].handle, 'kai');
  assert.equal(updated.social.profiles[0].displayName, 'Kai');
  assert.equal(JSON.stringify(updated.social).includes('discard'), false);
});

test('draft approval is bound to the current pet, profile, platform and saved handle', () => {
  const data = care();
  for (const invalid of [
    action({ petId: 'another-pet' }), action({ expiresAt: new Date(NOW).toISOString() }),
    action({ payload: { ...action().payload, profileId: 'unsaved-profile' } }),
    action({ payload: { ...action().payload, platform: 'facebook' } }),
    action({ payload: { ...action().payload, petHandle: 'another_pet' } }),
  ]) assert.throws(() => applyApprovedMuseAction(data, invalid, NOW));
  assert.equal(data.social.posts.length, 0);
  const saved = applyApprovedMuseAction(data, action(), NOW);
  assert.equal(saved.social.posts.length, 1);
  assert.equal(saved.social.posts[0].id, 'muse-social-proposal');
  assert.equal(saved.social.posts[0].petHandle, 'kai');
  assert.match(saved.social.posts[0].caption, /@kai$/);
  assert.equal(applyApprovedMuseAction(saved, action(), NOW), saved, 'retrying one approval must not create another draft');
});

test('unsupported account creation/publishing actions and malformed draft proposals cannot execute', () => {
  for (const type of ['create_social_profile', 'publish_social_post', 'send_social_post']) assert.throws(() => parseMuseAction(action({ type })), /unsupported/);
  for (const payload of [
    { ...action().payload, platform: 'tiktok' }, { ...action().payload, profileId: '' },
    { ...action().payload, petHandle: '@@kai' }, { ...action().payload, caption: '' },
    { ...action().payload, note: 'a'.repeat(1_001) }, { ...action().payload, caption: 'a'.repeat(1_800) },
  ]) assert.throws(() => parseMuseAction(action({ payload })));
});

test('approving social drafts preserves existing care, appointments and rewards without mutating prior state', () => {
  const data = care({ logs: [{ id: 'old-walk', type: 'walk', label: 'Walk', note: 'Older care', recordedAt: createdAt }], appointments: [{ id: 'vet', title: 'Check-up', date: '2099-01-01T08:00:00Z', note: '' }], rewards: [{ id: 'credit', label: 'Demo credit', amount: 5, createdAt }] });
  const before = JSON.stringify(data);
  const saved = applyApprovedMuseAction(data, action(), NOW);
  assert.deepEqual(saved.logs, data.logs); assert.deepEqual(saved.appointments, data.appointments); assert.deepEqual(saved.rewards, data.rewards);
  assert.equal(JSON.stringify(data), before);
  const oldOwner = { ...data }; delete oldOwner.social;
  assert.deepEqual(restoreSocialState(oldOwner.social), { profiles: [], posts: [] });
  assert.deepEqual(oldOwner.logs, data.logs);
});

test('editing a saved draft restores its pet mention and leaves other drafts untouched', () => {
  const data = care({ social: { profiles: [profile()], posts: [post(), post({ id: 'other-post' })] } });
  const before = JSON.stringify(data);
  const changed = updateSocialPostData(data, 'saved-post', 'A new caption with @kai2');
  assert.equal(changed.social.posts[0].caption, 'A new caption with @kai2\n\n@kai');
  assert.deepEqual(changed.social.posts[1], data.social.posts[1]);
  assert.equal(JSON.stringify(data), before);
  assert.throws(() => updateSocialPostData(data, 'missing-post', 'New caption'), /no longer available/);
});

test('an explicit handle edit retags saved drafts but invalidates pending proposals for the old handle', () => {
  const data = pending(care({ social: { profiles: [profile()], posts: [post({ caption: 'Meet @KAI and @kai2!' })] } }));
  const changed = saveSocialProfileData(data, pageInput({ handle: '@kai.new', url: 'https://www.instagram.com/kai.new/' }), 'instagram-kai', NOW + 1);
  assert.equal(changed.social.posts[0].petHandle, 'kai.new');
  assert.equal(changed.social.posts[0].caption, 'Meet @kai.new and @kai2!');
  assert.equal(restoreSocialState(changed.social).posts.length, 1, 'retagged drafts must survive another reload');
  assert.throws(() => approveConversationAction(changed, 'social-proposal', NOW + 1), /page changed|fresh draft/);
});

test('approved social drafts and decisions survive reload while an unbacked saved decision is discarded', () => {
  const before = pending();
  const unbacked = restoreMuseConversation({ ...before.muse, decisions: { 'social-proposal': 'saved' } }, before);
  assert.equal(unbacked.decisions['social-proposal'], undefined);
  const saved = JSON.parse(JSON.stringify(approveConversationAction(before, 'social-proposal', NOW)));
  saved.social = restoreSocialState(saved.social);
  saved.muse = restoreMuseConversation(saved.muse, saved);
  assert.equal(saved.muse.decisions['social-proposal'], 'saved');
  assert.equal(saved.social.posts.length, 1);
  assert.match(museHistory(saved.muse.messages, saved.muse.decisions)[0].content, /approved and saved locally.*Social post draft for @kai/);
  assert.equal(approveConversationAction(saved, 'social-proposal', NOW).social.posts.length, 1);
  const dismissed = dismissConversationAction(before, 'social-proposal');
  assert.throws(() => approveConversationAction(dismissed, 'social-proposal', NOW), /dismissed/);
  assert.equal(dismissed.social.posts.length, 0);
});

test('without a configured backend, local starter captions never copy health, location, photo or private page data', async context => {
  let sent = false;
  context.mock.method(globalThis, 'fetch', async () => { sent = true; throw new Error('Social preparation must stay local without consent.'); });
  const privateMarker = 'PRIVATE_HEALTH_LOCATION_DETAIL';
  const data = care({ backendUrl: '', logs: [{ id: 'vet-note', type: 'vet', label: 'Vet observation', note: privateMarker, recordedAt: createdAt }], appointments: [{ id: 'vet', title: privateMarker, date: '2099-01-01T08:00:00Z', note: privateMarker }], social: { profiles: [profile({ bio: 'PRIVATE_PAGE_BIO' })], posts: [post({ caption: 'PRIVATE_OLD_CAPTION @kai' })] } });
  data.pet.avatar = { uri: 'data:image/png;base64,PRIVATE_PHOTO_PIXELS', createdAt, style: 'muse-plush' };
  const response = await requestMuse('Draft an Instagram post about our day.', data, [], '');
  assert.equal(sent, false); assert.equal(response.mode, 'demo');
  assert.equal(response.proposedActions.length, 1);
  assert.equal(response.proposedActions[0].payload.profileId, 'instagram-kai');
  assert.match(response.proposedActions[0].payload.caption, /@kai$/);
  assert.doesNotMatch(JSON.stringify(response), /PRIVATE_HEALTH_LOCATION_DETAIL|PRIVATE_PAGE_BIO|PRIVATE_OLD_CAPTION|PRIVATE_PHOTO_PIXELS/);
  assert.equal(data.social.posts.length, 1, 'a proposal is not a saved post before approval');
});

test('local social drafting requires a resolved saved page and an explicit platform when ambiguous', async () => {
  const empty = await requestMuse('Draft a post.', care({ social: undefined }), [], '');
  assert.deepEqual(empty.proposedActions, []);
  const data = care({ social: { profiles: [profile(), profile({ id: 'facebook-kai', platform: 'facebook', url: 'https://www.facebook.com/kai' })], posts: [] } });
  assert.deepEqual((await requestMuse('Draft a post.', data, [], '')).proposedActions, []);
  const selected = await requestMuse('Draft a Facebook post.', data, [], '');
  assert.equal(selected.proposedActions[0].payload.profileId, 'facebook-kai');
  assert.equal(selected.proposedActions[0].payload.platform, 'facebook');
});

test('a direct platform answer completes the preceding ambiguous local draft request', async () => {
  const data = care({ social: { profiles: [profile(), profile({ id: 'facebook-kai', platform: 'facebook', url: 'https://www.facebook.com/kai' })], posts: [] } });
  const choice = await requestMuse('Draft a post.', data, [], '');
  const history = [{ id: 'owner', role: 'user', content: 'Draft a post.' }, { id: 'choice', role: 'assistant', content: choice.reply, mode: choice.mode }];
  for (const [answer, platform, profileId] of [['Instagram please', 'instagram', 'instagram-kai'], ['Facebook.', 'facebook', 'facebook-kai']]) {
    const selected = await requestMuse(answer, data, history, '');
    assert.equal(selected.mode, 'demo');
    assert.equal(selected.proposedActions.length, 1);
    assert.equal(selected.proposedActions[0].payload.platform, platform);
    assert.equal(selected.proposedActions[0].payload.profileId, profileId);
  }
  const unrelated = await requestMuse('Instagram please', data, [{ id: 'other', role: 'assistant', content: 'How was your walk?' }], '');
  assert.deepEqual(unrelated.proposedActions, [], 'a platform name alone must not invent an unrelated drafting request');
});

test('ordinary care requests omit saved social profiles and drafts outside explicit drafting requests', async context => {
  let body;
  context.mock.method(globalThis, 'fetch', async (_url, options) => { body = JSON.parse(options.body); return Response.json({ mode: 'demo', reply: 'Care context received.' }); });
  const data = care({ backendUrl: 'https://muse.example', social: { profiles: [profile({ bio: 'PRIVATE_PAGE_BIO' })], posts: [post({ caption: 'PRIVATE_POST_CAPTION @kai' })] } });
  data.pet.avatar = { uri: `data:image/png;base64,${'A'.repeat(900_000)}`, createdAt, style: 'muse-plush' };
  await requestMuse('Summarize care.', data, [], '');
  assert.equal(Object.hasOwn(body, 'social'), false); assert.equal(Object.hasOwn(body, 'socialProfiles'), false);
  assert.equal(Object.hasOwn(body.pet, 'avatar'), false);
  assert.doesNotMatch(JSON.stringify(body), /PRIVATE_PAGE_BIO|PRIVATE_POST_CAPTION/);
});

test('approved local social turns and their owner-decision handles are omitted from subsequent model history', async context => {
  let body;
  context.mock.method(globalThis, 'fetch', async (_url, options) => { body = JSON.parse(options.body); return Response.json({ mode: 'demo', reply: 'Care context received.' }); });
  const privateProfile = profile({ handle: 'private_social_handle', url: '' });
  const proposal = action({ payload: { ...action().payload, petHandle: privateProfile.handle, caption: 'PRIVATE_SOCIAL_CAPTION' } });
  const approved = approveConversationAction(pending(care({ social: { profiles: [privateProfile], posts: [] } }), proposal), proposal.id, NOW);
  const history = museHistory(approved.muse.messages, approved.muse.decisions);
  assert.match(JSON.stringify(history), /private_social_handle/, 'fixture must include the handle in the confirmed owner decision');
  history.push({ id: 'private-social-request', role: 'user', content: 'Draft a post about PRIVATE_SOCIAL_REQUEST.' });
  history.push({ id: 'care-reply', role: 'assistant', content: 'Your recorded care timeline is ready.' });
  await requestMuse('Summarize care.', { ...approved, backendUrl: 'https://muse.example' }, history, '');
  assert.deepEqual(body.history, [{ role: 'assistant', content: 'Your recorded care timeline is ready.' }]);
  assert.doesNotMatch(JSON.stringify(body), /private_social_handle|PRIVATE_SOCIAL_CAPTION|PRIVATE_SOCIAL_REQUEST|Social post draft/);
});

test('social routing uses the backend only for an explicit request with one resolved saved page', () => {
  const connected = care({ backendUrl: 'https://muse.example' });
  assert.equal(isSocialDraftRequest('Draft an Instagram post.'), true);
  assert.equal(isLocalSocialDraftRequest('Draft an Instagram post.', [], connected), false);
  assert.equal(isLocalSocialDraftRequest('Draft an Instagram post.', [], care()), true);
  assert.equal(isLocalSocialDraftRequest('Draft an Instagram post.', [], care({ backendUrl: 'https://muse.example', social: undefined })), true);
  const two = care({ backendUrl: 'https://muse.example', social: { profiles: [profile(), profile({ id: 'facebook-kai', platform: 'facebook', url: '' })], posts: [] } });
  assert.equal(isLocalSocialDraftRequest('Draft a pet post.', [], two), true);
  assert.equal(isLocalSocialDraftRequest('Draft a Facebook and Instagram post.', [], two), true);
  assert.equal(isLocalSocialDraftRequest('Draft a TikTok post.', [], connected), true);
  for (const message of ['Summarize today', 'Do not draft a post', 'Don’t publish an Instagram post']) {
    assert.equal(isSocialDraftRequest(message), false);
    assert.equal(isLocalSocialDraftRequest(message, [], connected), false);
  }
});

test('a live draft sends only the explicitly selected five page fields and minimal pet identity', async context => {
  let observed;
  const responseAction = action({ expiresAt: '2099-01-01T00:00:00Z' });
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    observed = { url, options, body: JSON.parse(options.body) };
    return Response.json({ mode: 'live', reply: 'Review this generated caption.', proposedActions: [responseAction] });
  });
  const selected = profile({ bio: 'Owner-approved page bio', url: 'https://www.instagram.com/kai/?private=PRIVATE_PAGE_URL' });
  const data = care({ backendUrl: 'https://muse.example', social: { profiles: [selected, profile({ id: 'other-facebook-page', platform: 'facebook', handle: 'other_private_handle', displayName: 'PRIVATE_OTHER_PAGE', bio: 'PRIVATE_OTHER_BIO', url: '' })], posts: [post({ caption: 'PRIVATE_SAVED_DRAFT @kai' })] }, logs: [{ id: 'health', type: 'vet', label: 'Vet note', note: 'PRIVATE_HEALTH_NOTE', recordedAt: createdAt }], appointments: [{ id: 'vet', title: 'PRIVATE_APPOINTMENT', date: '2099-01-01T08:00:00Z', note: 'PRIVATE_CLINIC_LOCATION' }] });
  data.pet = { ...data.pet, breed: 'PRIVATE_BREED', age: 'PRIVATE_AGE', avatar: { uri: 'data:image/png;base64,PRIVATE_PHOTO_PIXELS', createdAt, style: 'muse-plush' } };
  const before = JSON.stringify(data);
  const message = 'Draft an Instagram post about everyday moments.';
  const result = await requestMuse(message, data, [{ id: 'old', role: 'assistant', content: 'PRIVATE_OLD_CONVERSATION' }], 'development-token', { credentials: 'include', headers: { 'X-Muse-Owner': 'verified-owner' } });
  assert.equal(observed.url, 'https://muse.example/api/muse/chat');
  assert.equal(observed.options.credentials, 'include');
  assert.equal(observed.options.headers.Authorization, undefined);
  assert.equal(observed.options.headers['X-Muse-Owner'], 'verified-owner');
  assert.deepEqual(observed.body, { message, pet: { id: data.pet.id, name: data.pet.name, species: data.pet.species }, logs: [], appointments: [], history: [], taskPurpose: 'social_draft', socialProfiles: [{ id: selected.id, platform: selected.platform, displayName: selected.displayName, handle: selected.handle, bio: selected.bio }] });
  assert.doesNotMatch(JSON.stringify(observed.body), /PRIVATE_|other_private_handle/);
  const parsed = parseChatRequest(observed.body);
  assert.equal(parsed.taskPurpose, 'social_draft');
  assert.equal(parsed.socialProfiles.length, 1);
  assert.equal(parsed.socialProfiles[0].id, selected.id);
  assert.deepEqual(parsed.logs, []); assert.deepEqual(parsed.appointments, []); assert.deepEqual(parsed.history, []);
  assert.equal(result.mode, 'live');
  assert.equal(result.proposedActions[0].payload.profileId, selected.id);
  assert.match(result.proposedActions[0].payload.caption, /@kai$/);
  assert.equal(JSON.stringify(data), before, 'a generated proposal does not save a draft before owner approval');
});

test('large unrelated saved data cannot enter or inflate a selected-page drafting request', async context => {
  let body; let bytes;
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    body = JSON.parse(options.body); bytes = Buffer.byteLength(options.body, 'utf8');
    return Response.json({ mode: 'live', reply: 'Review your caption.', proposedActions: [action({ expiresAt: '2099-01-01T00:00:00Z' })] });
  });
  const selected = profile({ displayName: '犬'.repeat(80), bio: '犬'.repeat(500) });
  const data = care({ backendUrl: 'https://muse.example', social: { profiles: [selected], posts: Array.from({ length: 50 }, (_, index) => post({ id: `post-${index}`, caption: `${'x'.repeat(1_700)} @kai` })) }, logs: Array.from({ length: 100 }, (_, index) => ({ id: `health-${index}`, type: 'vet', label: 'Health', note: 'PRIVATE_HEALTH_'.repeat(70), recordedAt: createdAt })) });
  data.pet.avatar = { uri: `data:image/png;base64,${'A'.repeat(900_000)}`, createdAt, style: 'muse-plush' };
  const history = Array.from({ length: 40 }, (_, index) => ({ id: `history-${index}`, role: 'assistant', content: 'PRIVATE_HISTORY_'.repeat(600) }));
  await requestMuse(`Draft an Instagram post. ${'🐾'.repeat(950)}`, data, history, '');
  assert.ok(bytes < 10_000 && bytes <= 60 * 1_024);
  assert.equal(body.socialProfiles.length, 1);
  assert.equal(body.socialProfiles[0].displayName, selected.displayName);
  assert.equal(body.socialProfiles[0].bio, selected.bio);
  assert.deepEqual(body.logs, []); assert.deepEqual(body.history, []);
  assert.equal(Object.hasOwn(body.pet, 'avatar'), false);
  assert.doesNotThrow(() => parseChatRequest(body));
});

test('a connected ambiguous request stays local until the owner selects its page', async context => {
  let calls = 0; let body;
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls++; body = JSON.parse(options.body);
    return Response.json({ mode: 'live', reply: 'Review this draft.', proposedActions: [action({ expiresAt: '2099-01-01T00:00:00Z' })] });
  });
  const data = care({ backendUrl: 'https://muse.example', social: { profiles: [profile(), profile({ id: 'facebook-kai', platform: 'facebook', url: '' })], posts: [] } });
  const choice = await requestMuse('Draft a post.', data, [], '');
  assert.equal(calls, 0); assert.deepEqual(choice.proposedActions, []);
  const history = [{ id: 'choice', role: 'assistant', content: choice.reply }];
  assert.equal(isLocalSocialDraftRequest('Instagram please', history, data), false);
  const result = await requestMuse('Instagram please', data, history, '');
  assert.equal(calls, 1); assert.equal(result.mode, 'live');
  assert.equal(body.socialProfiles[0].platform, 'instagram');
  assert.deepEqual(body.history, [], 'the selection prompt does not carry prior conversation context into the draft request');
});

test('a live response cannot substitute another pet/page/handle/platform or a non-social action', async context => {
  let proposedActions;
  context.mock.method(globalThis, 'fetch', async () => Response.json({ mode: 'live', reply: 'Review a draft.', proposedActions }));
  const data = care({ backendUrl: 'https://muse.example' });
  const valid = action({ expiresAt: '2099-01-01T00:00:00Z' });
  const wrong = [
    { ...valid, petId: 'another-pet' },
    { ...valid, payload: { ...valid.payload, profileId: 'another-page' } },
    { ...valid, payload: { ...valid.payload, platform: 'facebook' } },
    { ...valid, payload: { ...valid.payload, petHandle: 'another_handle' } },
    { ...valid, type: 'record_care', payload: { kind: 'walk', label: 'Walk', note: '', recordedAt: createdAt } },
  ];
  for (const mismatch of wrong) {
    proposedActions = [mismatch];
    await assert.rejects(requestMuse('Draft an Instagram post.', data, [], ''), /selected pet page/);
  }
  for (proposedActions of [[], undefined, [valid, wrong[0]], 'not-an-array', new Array(4).fill(valid)]) {
    await assert.rejects(requestMuse('Draft an Instagram post.', data, [], ''));
  }
  assert.equal(data.social.posts.length, 0, 'rejected provider output must not change saved drafts');
});

test('live drafting failures remain errors and never fall back to a local starter caption', async context => {
  let calls = 0;
  const mockedFetch = context.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ error: 'Provider unavailable' }, { status: 503 }); });
  const data = care({ backendUrl: 'https://muse.example' });
  await assert.rejects(requestMuse('Draft an Instagram post.', data, [], ''));
  mockedFetch.mock.mockImplementation(async () => { calls++; throw new TypeError('Network unavailable'); });
  await assert.rejects(requestMuse('Draft an Instagram post.', data, [], ''), /Could not reach Muse/);
  mockedFetch.mock.mockImplementation(async () => { calls++; throw new DOMException('Timed out', 'AbortError'); });
  await assert.rejects(requestMuse('Draft an Instagram post.', data, [], ''), /took too long/);
  mockedFetch.mock.mockImplementation(async () => { calls++; return Response.json({ mode: 'live', reply: 'Only prose, no prepared draft.' }); });
  await assert.rejects(requestMuse('Draft an Instagram post.', data, [], ''), /selected pet page/);
  assert.equal(calls, 4);
  assert.equal(data.social.posts.length, 0);
});
