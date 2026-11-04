import test from 'node:test';
import assert from 'node:assert/strict';
import { isSlideshowRequest } from '../../src/slideshowIntent.ts';
import { requestMuse } from '../../src/muse.ts';
import { initialData } from '../../src/data.ts';
import { appendMuseMessage, restoreMuseConversation } from '../../src/museConversation.ts';

test('explicit slideshow requests open the studio, while negation and unrelated questions do not', () => {
  for (const message of ['Muse make a slideshow with music of me and my pet', 'Please create a slide show', 'Can you build a slide-show from my tagged photos?', 'Slideshow please', "Don’t upload anything; make a slideshow with my pet", 'Without publishing, create a slideshow', 'Do not make an appointment; make a slideshow']) assert.equal(isSlideshowRequest(message), true, message);
  for (const message of ['Do not make a slideshow', 'Don’t create a slide show', 'Cancel the slideshow', 'Make a care note instead of a slideshow', 'Can a slideshow upset a dog?', 'Draft a pet post', 'Make a meal plan', 'a'.repeat(2001)]) assert.equal(isSlideshowRequest(message), false, message);
});

test('slideshow studio requests stay local even with a configured live backend', async context => {
  context.mock.method(globalThis, 'fetch', () => { throw new Error('A local studio request must not send a model request.'); });
  const data = { ...initialData, backendUrl: 'https://muse.example', pet: { ...initialData.pet, name: 'Synthetic Pet' } };
  const result = await requestMuse('Muse make a slideshow with music', data, [], '');
  assert.equal(result.localDestination, '/slideshow');
  assert.equal(result.mode, 'local');
  assert.deepEqual(result.proposedActions, []);
  assert.match(result.reply, /Synthetic Pet/);
  const saved = appendMuseMessage(data, { id: 'studio-reply', role: 'assistant', content: result.reply, mode: result.mode });
  const restored = restoreMuseConversation(JSON.parse(JSON.stringify(saved.muse)), saved);
  assert.equal(restored.messages[0].mode, 'local');
  assert.equal(saved.logs.length, data.logs.length);
});
