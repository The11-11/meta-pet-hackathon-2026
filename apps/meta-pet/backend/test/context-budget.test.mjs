import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData } from '../../src/data.ts';
import { requestMuse } from '../../src/muse.ts';
import { parseChatRequest } from '../src/muse.mjs';

const MAX_CONTEXT_BYTES = 60 * 1_024;
const care = (index, note) => ({ id: `care-${index}`, type: 'walk', label: `Walk ${index}`, note, recordedAt: new Date(Date.now() - index * 60_000).toISOString() });
const appointment = (index, note) => ({ id: `appointment-${index}`, title: `Visit ${index}`, note, date: new Date(Date.UTC(2099, 0, index + 1)).toISOString() });

function capture(context) {
  let observed;
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    observed = { body: JSON.parse(options.body), bytes: Buffer.byteLength(options.body, 'utf8') };
    return Response.json({ mode: 'demo', reply: 'Context received.' });
  });
  return () => observed;
}

test('multibyte context stays below 60 KiB while preserving message, pet and newest logs', async context => {
  const read = capture(context);
  const data = { ...initialData, backendUrl: 'http://muse.example', logs: Array.from({ length: 50 }, (_, index) => care(index, '犬'.repeat(600))) };
  const history = Array.from({ length: 3 }, (_, index) => ({ id: `message-${index}`, role: 'assistant', content: '🐕'.repeat(1_000) }));
  const original = JSON.stringify({ data, history });
  const message = '今日の世話をまとめて 🐾';
  await requestMuse(message, data, history, '');
  const observed = read();
  assert.ok(observed.bytes <= MAX_CONTEXT_BYTES);
  assert.equal(observed.body.message, message);
  assert.deepEqual(observed.body.pet, data.pet);
  assert.equal(observed.body.history.length, 0);
  assert.ok(observed.body.logs.length > 0 && observed.body.logs.length < 50);
  assert.deepEqual(observed.body.logs, data.logs.slice(0, observed.body.logs.length));
  assert.equal(JSON.stringify({ data, history }), original, 'trimming must not remove locally saved records');
  assert.doesNotThrow(() => parseChatRequest(observed.body));
});

test('oldest history is removed before any care records', async context => {
  const read = capture(context);
  const data = { ...initialData, backendUrl: 'http://muse.example', logs: Array.from({ length: 40 }, (_, index) => care(index, 'a'.repeat(1_000))) };
  const history = Array.from({ length: 3 }, (_, index) => ({ id: `message-${index}`, role: 'assistant', content: `${index}:` + '犬'.repeat(2_998) }));
  await requestMuse('Summarize my records.', data, history, '');
  const observed = read();
  assert.ok(observed.bytes <= MAX_CONTEXT_BYTES);
  assert.deepEqual(observed.body.logs, data.logs);
  assert.equal(observed.body.history.length, 1);
  assert.equal(observed.body.history[0].content, history.at(-1).content);
});

test('furthest appointments are removed after history and logs', async context => {
  const read = capture(context);
  const data = {
    ...initialData, backendUrl: 'http://muse.example',
    logs: [care(0, 'Owner note')],
    appointments: Array.from({ length: 20 }, (_, index) => appointment(index, '犬'.repeat(1_000))).reverse(),
  };
  const history = [{ id: 'message', role: 'assistant', content: 'Previous reply' }];
  const message = 'Check my next appointment. ' + 'x'.repeat(3_900);
  await requestMuse(message, data, history, '');
  const observed = read();
  assert.ok(observed.bytes <= MAX_CONTEXT_BYTES);
  assert.equal(observed.body.message, message);
  assert.equal(observed.body.history.length, 0);
  assert.equal(observed.body.logs.length, 0);
  assert.ok(observed.body.appointments.length > 0 && observed.body.appointments.length < 20);
  assert.equal(observed.body.appointments[0].id, 'appointment-0');
  assert.deepEqual(observed.body.appointments.map(item => item.id), Array.from({ length: observed.body.appointments.length }, (_, index) => `appointment-${index}`));
  assert.doesNotThrow(() => parseChatRequest(observed.body));
});
