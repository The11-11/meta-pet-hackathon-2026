import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, rmdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Never inherit application credentials or load .env. Invalid PORT checks the
// server's entry guard without opening a listener; auth's guard fails before DB
// setup, so these tests do not create accounts/databases or call a provider.
const env = { PORT: '0', HOST: '127.0.0.1' };
const execute = (args, options = {}) => spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8', timeout: 5_000, ...options });

test('canonical CLI entries execute startup validation', () => {
  const server = execute([join(root, 'backend/src/server.mjs')]);
  assert.equal(server.status, 1);
  assert.match(server.stderr, /PORT must be an integer/);
  const auth = execute([join(root, 'backend/src/auth.mjs')]);
  assert.equal(auth.status, 1);
  assert.match(auth.stderr, /Use the authentication setup command/);
});

test('directory-junction CLI entries execute the same startup validation as canonical paths', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'meta-pet-cli-'));
  const alias = join(temporary, 'app-alias');
  try {
    symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const server = execute([join(alias, 'backend/src/server.mjs')]);
    assert.equal(server.status, 1);
    assert.match(server.stderr, /PORT must be an integer/);
    const auth = execute([join(alias, 'backend/src/auth.mjs')]);
    assert.equal(auth.status, 1);
    assert.match(auth.stderr, /Use the authentication setup command/);
  } finally {
    // Unlink the junction itself before deleting the now-empty fixture folder;
    // never recursively traverse or remove the application directory.
    rmSync(alias, { force: true });
    rmdirSync(temporary);
  }
});

test('stdin imports do not treat the nonexistent dash entry as either CLI', () => {
  const server = new URL('../src/server.mjs', import.meta.url).href;
  const auth = new URL('../src/auth.mjs', import.meta.url).href;
  const result = execute(['--input-type=module', '-'], { input: `await import(${JSON.stringify(server)}); await import(${JSON.stringify(auth)}); console.log('imported safely');` });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /imported safely/);
});
