import assert from 'node:assert/strict';
import test from 'node:test';
import { isAuthDestination } from '../../src/authDestination.ts';

test('native session is limited to the configured auth server', () => {
  const trusted = 'https://api.muse.test';
  assert.equal(isAuthDestination(trusted + '/', trusted), true);
  for (const destination of ['http://api.muse.test', 'https://api.muse.test:8443', 'https://other.test',
    'https://api.muse.test.attacker.test', 'https://api.muse.test/elsewhere',
    'https://user:password@api.muse.test', 'https://api.muse.test?next=elsewhere', 'invalid', '']) {
    assert.equal(isAuthDestination(destination, trusted), false, destination);
  }
});

test('explicit local and base-path auth configuration remains exact', () => {
  assert.equal(isAuthDestination('http://localhost:8787/', 'http://localhost:8787'), true);
  assert.equal(isAuthDestination('http://localhost:8788', 'http://localhost:8787'), false);
  assert.equal(isAuthDestination('https://muse.test/backend/', 'https://muse.test/backend'), true);
  assert.equal(isAuthDestination('https://muse.test', 'https://muse.test/backend'), false);
});
