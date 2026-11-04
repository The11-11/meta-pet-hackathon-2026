import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MUSE_MEMORY_BYTES, parseMusePageMemory, validMemoryPageId } from '../src/museMemoryData.ts';
const response = markdown => ({ available: true, exists: true, updatedAt: '2026-11-02T08:00:00.000Z', markdown });

test('memory reader accepts at most 16 KiB of UTF-8 text', () => {
  assert.equal(parseMusePageMemory(response('a'.repeat(MAX_MUSE_MEMORY_BYTES)))?.markdown.length, MAX_MUSE_MEMORY_BYTES);
  assert.equal(parseMusePageMemory(response('a'.repeat(MAX_MUSE_MEMORY_BYTES + 1))), null);
  assert.ok(parseMusePageMemory(response('犬'.repeat(5461))));
  assert.equal(parseMusePageMemory(response('犬'.repeat(5462))), null);
  assert.ok(parseMusePageMemory(response('🐾'.repeat(4096))));
  assert.equal(parseMusePageMemory(response('🐾'.repeat(4097))), null);
});

test('memory parser retains plain text literally and excludes extra server fields', () => {
  const markdown = '# Care notes\n<script>alert("test")</script>\n[untrusted](https://invalid.example)';
  const parsed = parseMusePageMemory({ ...response(markdown), ownerId: 'PRIVATE_OWNER', path: 'PRIVATE_PATH', token: 'PRIVATE_TOKEN' });
  assert.deepEqual(parsed, response(markdown));
  assert.doesNotMatch(JSON.stringify(parsed), /PRIVATE_/);
});

test('empty memory cannot display stale content or timestamps', () => {
  assert.deepEqual(parseMusePageMemory({ available: true, exists: false, updatedAt: '2026-11-02T08:00:00.000Z', markdown: 'OLD_PRIVATE_CONTENT' }), { available: true, exists: false, updatedAt: null, markdown: '' });
});

test('unsupported and malformed memory metadata is rejected', () => {
  for (const input of [null, {}, { ...response('safe'), available: false }, { ...response('safe'), exists: 'yes' }, { ...response('safe'), updatedAt: 'not a date' }, { ...response('safe'), markdown: { html: '<script>' } }]) assert.equal(parseMusePageMemory(input), null);
});

test('memory requests require a bounded current pet-page identifier', () => {
  assert.equal(validMemoryPageId('pet-123'), true);
  for (const id of ['', '   ', 'x'.repeat(101), null, { id: 'private' }]) assert.equal(validMemoryPageId(id), false);
});
