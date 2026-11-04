import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData } from '../../src/data.ts';
import { requestMuse } from '../../src/muse.ts';

test('mobile chat sends upcoming saved appointments and bounded recent conversation excerpts', async context => {
  let observed;
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    observed = { url, body: JSON.parse(options.body) };
    return Response.json({ mode: 'demo', reply: 'Appointment context received.' });
  });
  const data = {
    ...initialData,
    backendUrl: 'http://muse.example',
    appointments: [
      { id: 'past', title: 'Past visit', date: '2000-01-01T08:00:00Z', note: '' },
      { id: 'future', title: 'Next check-up', date: '2099-10-30T07:30:00Z', note: 'Bring notes' },
    ],
  };
  const history = Array.from({ length: 6 }, (_, index) => ({ id: `${index}`, role: 'assistant', content: `${index}:` + 'x'.repeat(4_000) }));
  await requestMuse('When is the next vet visit?', data, history, '');
  assert.equal(observed.url, 'http://muse.example/api/muse/chat');
  assert.deepEqual(observed.body.appointments, [data.appointments[1]]);
  assert.equal(observed.body.history.reduce((sum, item) => sum + item.content.length, 0), 9_000);
  assert.ok(observed.body.history.every(item => item.content.length <= 3_000));
  assert.equal(observed.body.history.at(-1).content, history.at(-1).content.slice(0, 3_000));
});
