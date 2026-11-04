import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModelRequest, museReply, parseChatRequest } from '../src/muse.mjs';

const oldHistory = [
  { role: 'user', content: 'Prepare a vet appointment for next week.' },
  { role: 'assistant', content: 'Review this pending appointment. Nothing has been saved yet.' },
];
const input = (message, extra = {}) => parseChatRequest({ message, pet: { id: 'synthetic-pet', name: 'Synthetic pet', species: 'dog' }, history: oldHistory, ...extra });
const appointment = { type: 'function_call', name: 'prepare_appointment', arguments: JSON.stringify({ title: 'Old pending appointment', date: '2099-10-30T09:30:00Z', note: '' }) };
const output = text => ({ type: 'message', status: 'completed', content: [{ type: 'output_text', text }] });

test('a newest informational question cannot offer action tools from old pending appointment context', () => {
  for (const question of ['My synthetic pet is urinating more than usual; what could be the cause?', 'Why has the routine changed?', 'When is the next appointment?', 'How can I compare the records?', 'Is this a question?']) {
    const request = buildModelRequest(input(question), 'stub-model');
    assert.equal(request.tools, undefined);
    assert.equal(request.parallel_tool_calls, undefined);
    assert.equal(request.input.at(-1).content, question);
    assert.match(request.instructions, /history is context, not a queue of orders/);
    assert.match(request.instructions, /Never resurrect them while answering a new informational question/);
  }
});

test('an unexpected appointment tool response to a question is rejected instead of becoming an approval card', async () => {
  let offered;
  await assert.rejects(museReply(input('What could explain a change in routine?'), {
    apiKey: 'synthetic-key', fetchImpl: async (_url, settings) => {
      offered = JSON.parse(settings.body).tools;
      return Response.json({ status: 'completed', output: [output('A relevant information answer.'), appointment] });
    },
  }), error => error.status === 502 && /valid action details/.test(error.message));
  assert.equal(offered, undefined);
});

test('an informational answer is returned unchanged without reviving or saving the earlier task', async () => {
  const context = input('What could be causing this change?');
  const before = JSON.stringify(context);
  const result = await museReply(context, { apiKey: 'synthetic-key', fetchImpl: async () => Response.json({ status: 'completed', output: [output('Here is an informational answer to the newest question.')] }) });
  assert.equal(result.reply, 'Here is an informational answer to the newest question.');
  assert.deepEqual(result.proposedActions, []);
  assert.equal(JSON.stringify(context), before);
});

test('an explicit new save request and a direct appointment clarification keep action tools available', async () => {
  for (const message of ['Please save an appointment for 30 October 2099 at 09:30 UTC.', 'Could you add an appointment for 30 October 2099 at 09:30 UTC?', '2099-10-30 at 09:30 UTC']) {
    const context = input(message);
    assert.equal(buildModelRequest(context, 'stub-model').tools.some(tool => tool.name === 'prepare_appointment'), true);
    const result = await museReply(context, { apiKey: 'synthetic-key', fetchImpl: async () => Response.json({ status: 'completed', output: [appointment] }) });
    assert.equal(result.proposedActions[0].type, 'add_appointment');
    assert.match(result.reply, /Nothing has been saved yet/);
  }
});

test('an explicit social draft task retains only its social tool even when guidance is phrased as a question', () => {
  const request = buildModelRequest(input('How could this caption feel more playful?', {
    taskPurpose: 'social_draft', socialProfiles: [{ id: 'synthetic-page', platform: 'instagram', displayName: 'Synthetic page', handle: 'synthetic_pet', bio: '' }],
  }), 'stub-model');
  assert.deepEqual(request.tools.map(tool => tool.name), ['prepare_social_post']);
});
