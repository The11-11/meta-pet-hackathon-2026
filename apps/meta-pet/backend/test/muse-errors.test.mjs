import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData } from '../../src/data.ts';
import { requestMuse } from '../../src/muse.ts';

const data = { ...initialData, backendUrl: 'https://muse.example' };

test('chat surfaces the backend diagnosis instead of incorrectly pointing every failure at connection settings', async context => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Muse did not finish its response. Please try again.' }, { status: 502 }));
  await assert.rejects(requestMuse('Hello Muse', data, [], 'synthetic-token'), /did not finish its response/);
});

test('missing authorization uses the reconnect instruction rather than an arbitrary backend error', async context => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'SYNTHETIC_PRIVATE_DIAGNOSTIC' }, { status: 401 }));
  await assert.rejects(requestMuse('Hello Muse', data, [], ''), error => /session token.*test the connection/.test(error.message) && !error.message.includes('SYNTHETIC_PRIVATE_DIAGNOSTIC'));
});

test('unstructured or excessive failure bodies use a short fallback', async context => {
  const responses = [new Response('Unavailable', { status: 502 }), Response.json({ error: 'x'.repeat(301) }, { status: 503 })];
  context.mock.method(globalThis, 'fetch', async () => responses.shift());
  for (let index = 0; index < 2; index++) await assert.rejects(requestMuse('Hello Muse', data, [], ''), /Muse could not complete that request/);
});
