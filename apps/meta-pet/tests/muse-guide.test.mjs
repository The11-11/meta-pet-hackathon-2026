import test from 'node:test';
import assert from 'node:assert/strict';
import { museGuideProgress, careReviewRequest, careReviewDraft, submitCareReview } from '../src/museGuide.ts';

test('guide waits for a saved care record, not a chat proposal or appointment', () => {
  const data = { logs: [], appointments: [{ date: '2030-01-01T12:00:00Z' }], muse: { messages: [{ proposedActions: [{ type: 'record_care' }] }] } };
  assert.equal(museGuideProgress(data, Date.parse('2026-11-02')).hasCareEntry, false);
  assert.equal(museGuideProgress(data, Date.parse('2026-11-02')).upcomingAppointments, 1);
  assert.equal(museGuideProgress({ ...data, logs: [{ id: 'saved' }] }).hasCareEntry, true);
  assert.equal(data.logs.length, 0);
});

test('review requests use the owner’s real description and reject empty or overlong text', () => {
  assert.equal(careReviewRequest('walk', '  Ten minutes  in the park '), 'record walk: Ten minutes in the park');
  assert.equal(careReviewRequest('feeding', 'Breakfast'), 'record feeding: Breakfast');
  assert.throws(() => careReviewRequest('feeding', '  '));
  assert.throws(() => careReviewRequest('walk', 'x'.repeat(121)));
  assert.throws(() => careReviewRequest('vet', 'Checkup'));
});


test('overlong programmatic input stays invalid and never reaches the review callback', async () => {
 const description='A'.repeat(131); let calls=0;
 const draft=careReviewDraft('walk',description);
 assert.equal(draft.request,null); assert.match(draft.error,/1–120/);
 const message=await submitCareReview('walk',description,async()=>{calls++;});
 assert.match(message,/1–120/); assert.equal(calls,0); assert.equal(description.length,131);
});

test('review boundaries submit the complete valid description without clipping', async () => {
 const valid='x'.repeat(120); const calls=[];
 assert.equal(careReviewDraft('walk',valid).request,'record walk: '+valid);
 assert.equal(await submitCareReview('walk',valid,async value=>{calls.push(value);}), '');
 assert.deepEqual(calls,['record walk: '+valid]);
 assert.equal(careReviewDraft('walk',valid+'x').request,null);
 assert.equal(careReviewDraft('walk','  ').request,null);
 assert.equal(careReviewDraft('vet','Checkup').request,null);
});

test('review submission turns synchronous and asynchronous callback failures into visible guidance', async () => {
 for(const ask of [()=>{throw new Error('fixture');},async()=>{throw new Error('fixture');}]){
  assert.match(await submitCareReview('feeding','Breakfast',ask),/could not prepare this review/);
 }
});
