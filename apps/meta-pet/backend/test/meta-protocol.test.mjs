import test from 'node:test';
import assert from 'node:assert/strict';
import { checkProvider, museReply, parseChatRequest } from '../src/muse.mjs';

const input = () => parseChatRequest({ message: 'Record the walk I just completed.', pet: { id: 'pet', name: 'Kai' } });
const message = status => ({ type: 'message', status, role: 'assistant', content: [{ type: 'output_text', text: 'A partial provider response.' }] });
const action = status => ({ type: 'function_call', status, call_id: 'call-walk', name: 'prepare_care_entry', arguments: JSON.stringify({ kind: 'walk', label: 'Completed walk', note: '', recordedAt: new Date().toISOString() }) });
const options = response => ({ apiKey: 'stub-server-key', model: 'muse-spark-1.3', fetchImpl: async () => Response.json(response) });
const unfinished = error => error.status === 502 && /did not finish/.test(error.message);

test('unfinished Meta response states cannot produce replies, approval cards or successful connection checks', async () => {
  for (const status of ['failed', 'incomplete', 'in_progress', 'queued', 'cancelled']) {
    const response = { status, output: [message('completed'), action('completed')] };
    await assert.rejects(museReply(input(), options(response)), unfinished);
    await assert.rejects(checkProvider(options(response)), unfinished);
  }
});

test('unfinished output items are rejected even if a provider marks the enclosing response completed', async () => {
  for (const output of [[message('incomplete')], [action('in_progress')], [message('completed'), action('incomplete')]]) {
    await assert.rejects(museReply(input(), options({ status: 'completed', output })), unfinished);
  }
});

test('HTTP200 provider error and incomplete details stay private and never verify the connection', async () => {
  for (const details of [{ error: { code: 'server_error', message: 'private-provider-diagnostic' } }, { incomplete_details: { reason: 'max_output_tokens' } }]) {
    const provider = options({ status: 'completed', output: [message('completed')], ...details });
    await assert.rejects(checkProvider(provider), error => unfinished(error) && !error.message.includes('private-provider-diagnostic'));
  }
});

test('completed Meta tool output still prepares one owner-reviewed care entry', async () => {
  const response = await museReply(input(), options({ status: 'completed', error: null, incomplete_details: null, output: [action('completed')] }));
  assert.equal(response.mode, 'live');
  assert.equal(response.proposedActions.length, 1);
  assert.equal(response.proposedActions[0].type, 'record_care');
  assert.match(response.reply, /Nothing has been saved/);
});

test('chat history uses documented assistant output_text with light reasoning and room for visible output', async () => {
  const context = parseChatRequest({ message: 'Reply with Ready.', pet: { id: 'synthetic-pet', name: 'Synthetic pet' }, history: [
    { role: 'user', content: 'Hello from a synthetic test.' },
    { role: 'assistant', content: 'I can help organize your pet care records.' },
  ] });
  let request;
  const result = await museReply(context, { apiKey: 'stub-key', fetchImpl: async (_url, settings) => {
    request = JSON.parse(settings.body);
    return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Ready.' }] }] });
  } });
  assert.equal(result.reply, 'Ready.');
  assert.deepEqual(request.reasoning, { effort: 'low' });
  assert.equal(request.max_output_tokens, 4096);
  assert.equal(request.store, false);
  assert.deepEqual(request.input.slice(1, -1), [
    { role: 'user', content: [{ type: 'input_text', text: context.history[0].content }] },
    { role: 'assistant', content: [{ type: 'output_text', text: context.history[1].content }] },
  ]);
});

test('reasoning-only token exhaustion remains a safe failure even with an HTTP200 response', async () => {
  const response = { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'reasoning', summary: [] }], usage: { output_tokens: 4096, output_tokens_details: { reasoning_tokens: 4096 } } };
  await assert.rejects(museReply(input(), options(response)), unfinished);
});
