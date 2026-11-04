import test from 'node:test';
import assert from 'node:assert/strict';
import { marketplaceIdeas } from '../../src/marketplace.ts';

test('Marketplace searches prioritize selected goals without mutating them', () => {
  const goals = ['sleep', 'feeding'];
  const results = marketplaceIdeas({ species: 'Dog' }, goals);
  assert.deepEqual(results.slice(0, 2).map(item => item.id), ['feeding', 'sleep']);
  assert.deepEqual(goals, ['sleep', 'feeding']);
  assert.equal(results.length, 4);
});

test('cat and unknown species do not receive dog harness searches', () => {
  assert.equal(marketplaceIdeas({ species: ' Cat ' }).find(item => item.id === 'walk').query, 'cat carrier');
  assert.equal(marketplaceIdeas({ species: 'Parrot' }).find(item => item.id === 'walk').query, 'pet carrier');
});

test('external links contain controlled product words and never private profile fields', () => {
  const pet = { species: 'Dog', name: 'PRIVATE_KAI', careNeeds: 'PRIVATE_MEDICAL_NOTE', breed: 'PRIVATE_BREED', age: 'PRIVATE_AGE' };
  for (const result of marketplaceIdeas(pet, ['vet'])) {
    const url = new URL(result.url);
    assert.equal(url.origin, 'https://www.facebook.com');
    assert.equal(url.pathname, '/marketplace/search/');
    assert.equal(url.searchParams.get('query'), result.query);
    assert.deepEqual([...url.searchParams.keys()], ['query']);
    assert.doesNotMatch(result.url, /PRIVATE|medicine|veterinary|live animal/i);
    assert.ok(result.check.length > 0);
  }
});

test('untrusted species cannot inject a URL, medication, private note or extra query field', () => {
  for (const species of ['https://evil.example/?token=SECRET', 'Dog&location=SECRET', 'cat medicine', '']) {
    for (const result of marketplaceIdeas({ species })) {
      assert.match(result.query, /^(pet feeding bowl|pet carrier|pet enrichment toy|washable pet bed)$/);
      assert.doesNotMatch(result.url, /evil|SECRET|medicine|location=/);
    }
  }
});
