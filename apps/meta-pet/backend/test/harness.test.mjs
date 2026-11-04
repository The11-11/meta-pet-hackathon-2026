import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMuseServer } from '../src/server.mjs';
import { museReply, parseChatRequest } from '../src/muse.mjs';
import { initialData } from '../../src/data.ts';
import { applyApprovedMuseAction } from '../../src/museActions.ts';
import { requestMuse, testMuseConnection } from '../../src/muse.ts';

const input = () => parseChatRequest({ message: 'Record the walk I just completed.', pet: { id: 'demo-pet', name: 'Kai', species: 'dog' } });
const call = (name, args) => ({ type: 'function_call', name, call_id: 'call-1', arguments: JSON.stringify(args) });
const care = () => call('prepare_care_entry', { kind: 'walk', label: 'Morning walk', note: 'Owner recorded a completed walk.', recordedAt: new Date().toISOString() });
const live = output => ({ apiKey: 'test-server-key', model: 'muse-spark-1.3', fetchImpl: async () => Response.json({ output }) });

test('Meta tool call prepares an owner-review action without mutating care data', async () => {
  let request;
  const result = await museReply(input(), { ...live([care()]), fetchImpl: async (_url, options) => {
    request = JSON.parse(options.body);
    return Response.json({ output: [care()] });
  } });
  assert.equal(result.mode, 'live');
  assert.equal(result.proposedActions.length, 1);
  assert.equal(result.proposedActions[0].type, 'record_care');
  assert.match(result.reply, /Nothing has been saved/);
  assert.equal(initialData.logs.length, 0);
  assert.deepEqual(request.tools.map(tool => tool.name), ['prepare_care_entry', 'prepare_appointment', 'prepare_social_post']);
  assert.equal(request.parallel_tool_calls, false);
  assert.equal(request.store, false);
});

test('approved care action saves once and stays idempotent after JSON reload', async () => {
  const { proposedActions: [action] } = await museReply(input(), live([care()]));
  const saved = applyApprovedMuseAction(initialData, action);
  assert.equal(saved.logs.length, 1);
  assert.equal(initialData.logs.length, 0);
  assert.equal(saved.logs[0].type, 'walk');
  const reloaded = JSON.parse(JSON.stringify(saved));
  assert.equal(applyApprovedMuseAction(reloaded, action), reloaded);
});

test('expired, wrong-pet and unsupported actions cannot change local records', async () => {
  const { proposedActions: [action] } = await museReply(input(), live([care()]));
  assert.throws(() => applyApprovedMuseAction(initialData, { ...action, expiresAt: '2000-01-01T00:00:00Z' }), /expired/);
  assert.throws(() => applyApprovedMuseAction(initialData, { ...action, petId: 'someone-else' }), /another pet/);
  assert.throws(() => applyApprovedMuseAction(initialData, { ...action, type: 'publish_post' }), /unsupported/);
  assert.equal(initialData.logs.length, 0);
});

test('appointment tool creates a local appointment only after approval', async () => {
  const appointment = call('prepare_appointment', { title: 'Vet check-up', date: '2099-10-30T09:30:00+02:00', note: 'Bring care notes.' });
  const { proposedActions: [action] } = await museReply(input(), live([appointment]));
  assert.equal(initialData.appointments.length, 0);
  const saved = applyApprovedMuseAction(initialData, action);
  assert.equal(saved.appointments[0].date, '2099-10-30T07:30:00.000Z');
  assert.equal(saved.appointments[0].title, 'Vet check-up');
  assert.equal(applyApprovedMuseAction(saved, action).appointments.length, 1);
});

test('unknown tools, invalid payloads and future completed activities fail closed', async () => {
  for (const item of [call('buy_crypto', {}), { ...care(), arguments: '{' }, call('prepare_care_entry', { kind: 'walk', label: 'Future walk', note: '', recordedAt: '2099-10-30T07:30:00Z' }), call('prepare_appointment', { title: 'Vet', date: '2099-10-30T07:30:00', note: '' })]) {
    await assert.rejects(museReply(input(), live([item])), /valid action details/);
  }
  await assert.rejects(museReply(input(), live(Array.from({length:4}, care))), /too many actions/);
});

test('local preview prepares an action, and sending it never auto-saves', async () => {
  const result = await requestMuse('Record walk: Evening walk completed', initialData, [], '');
  assert.equal(result.mode, 'demo');
  assert.equal(result.proposedActions.length, 1);
  assert.equal(initialData.logs.length, 0);
  assert.equal(applyApprovedMuseAction(initialData, result.proposedActions[0]).logs.length, 1);
});

test('mobile rejects unknown provider actions instead of showing approval controls', async context => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ mode: 'live', reply: 'Buy now', proposedActions: [{ type: 'purchase' }] }));
  await assert.rejects(requestMuse('Buy it', { ...initialData, backendUrl: 'http://localhost:8787' }, [], ''), /invalid action/);
});

async function withServer(env, run, fetchImpl = async () => Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Ready.' }] }] })) {
  const server = createMuseServer({ env, fetchImpl });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('connection check distinguishes demo, configured credentials and a verified provider', async () => {
  await withServer({}, async url => {
    const result = await testMuseConnection(url, '');
    assert.equal(result.verified, false);
    assert.match(result.message, /Add the Meta API key/);
  });
  await withServer({ MODEL_API_KEY: 'test-server-key', MUSE_CLIENT_TOKEN: 'test-client-token' }, async url => {
    assert.equal((await (await fetch(`${url}/health`)).json()).providerVerifiedAt, null);
    await assert.rejects(testMuseConnection(url, 'wrong-token'), /valid client token/);
    const result = await testMuseConnection(url, 'test-client-token');
    assert.equal(result.verified, true);
    const health = await (await fetch(`${url}/health`)).json();
    assert.equal(health.providerConfigured, true);
    assert.ok(health.providerVerifiedAt);
    assert.equal(JSON.stringify(health).includes('test-server-key'), false);
  });
});

test('failed provider verification remains a failure and does not mark the provider verified', async () => {
  await withServer({ MODEL_API_KEY: 'test-server-key', MUSE_CLIENT_TOKEN: 'test-client-token' }, async url => {
    await assert.rejects(testMuseConnection(url, 'test-client-token'), /credentials need attention/);
    assert.equal((await (await fetch(`${url}/health`)).json()).providerVerifiedAt, null);
  }, async () => new Response('private upstream error', { status: 401 }));
});
