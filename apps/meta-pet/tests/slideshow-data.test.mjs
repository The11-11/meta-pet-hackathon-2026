import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSlideshowDraft, emptySlideshow, loadSlideshowDraft, MAX_SLIDESHOW_IMAGE_CHARS, moveSlideshowPhoto, parseSlideshowDraft, parseSlideshowPhoto, saveSlideshowDraft, slideshowStorageKey } from '../src/slideshowData.ts';

const photo = (id = 'one') => ({ id, uri: 'data:image/jpeg;base64,YWJj', tag: 'pet', caption: '' });
const draft = () => ({ ...emptySlideshow('Demo pet'), photos: [photo()] });
const store = () => { const data = new Map(); return { data, getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value); }, removeItem: async key => { data.delete(key); } }; };

test('slideshow storage separates every owner mode, account and pet without delimiter collisions', () => {
  const values = [
    slideshowStorageKey({ id: 'a.b', mode: 'facebook' }, 'c'),
    slideshowStorageKey({ id: 'a', mode: 'facebook' }, 'b.c'),
    slideshowStorageKey({ id: 'a.b', mode: 'demo' }, 'c'),
    slideshowStorageKey({ id: 'a.b', mode: 'facebook' }, 'd'),
  ];
  assert.equal(new Set(values).size, values.length);
  assert.equal(slideshowStorageKey(null, 'pet'), null);
  assert.equal(slideshowStorageKey({ id: '', mode: 'facebook' }, 'pet'), null);
  assert.equal(slideshowStorageKey({ id: 'owner', mode: 'facebook' }, ''), null);
});

test('only bounded local JPEGs are restored and unrelated source metadata is discarded', () => {
  assert.deepEqual(parseSlideshowPhoto({ ...photo(), originalUri: 'https://private.example/photo', exif: { location: 'private' } }), photo());
  for (const uri of ['https://example.com/photo.jpg', 'file:///photo.jpg', 'blob:preview', 'data:image/svg+xml;base64,YWJj', 'data:image/jpeg;base64,', 'data:image/jpeg;base64,../../bad', 'data:image/jpeg;base64,' + 'a'.repeat(MAX_SLIDESHOW_IMAGE_CHARS)]) {
    assert.equal(parseSlideshowPhoto({ ...photo(), uri }), null);
  }
  assert.equal(parseSlideshowPhoto({ ...photo(), tag: 'facebook-user-id' }), null);
  assert.equal(parseSlideshowPhoto({ ...photo(), caption: 'x'.repeat(141) }), null);
});

test('slideshow restoration rejects invalid pace, too many slides, duplicate ids and blank titles', () => {
  const value = draft();
  for (const bad of [{ ...value, secondsPerSlide: 2 }, { ...value, secondsPerSlide: 7 }, { ...value, title: ' ' }, { ...value, photos: [photo(), photo()] }, { ...value, photos: Array.from({ length: 9 }, (_, i) => photo(String(i))) }]) {
    assert.equal(parseSlideshowDraft(bad), null);
  }
  const full = { ...value, secondsPerSlide: 6, photos: Array.from({ length: 8 }, (_, i) => photo(String(i))) };
  assert.equal(parseSlideshowDraft(full).photos.length, 8);
});

test('photo reordering is immutable, bounded and preserves captions and tags', () => {
  const value = { ...draft(), photos: [photo('one'), { ...photo('two'), caption: 'Together!', tag: 'together' }, photo('three')] };
  const before = JSON.stringify(value);
  const moved = moveSlideshowPhoto(value, 'two', -1);
  assert.deepEqual(moved.photos.map(item => item.id), ['two', 'one', 'three']);
  assert.equal(moved.photos[0].caption, 'Together!');
  assert.equal(JSON.stringify(value), before);
  assert.equal(moveSlideshowPhoto(value, 'one', -1), value);
  assert.equal(moveSlideshowPhoto(value, 'three', 1), value);
  assert.equal(moveSlideshowPhoto(value, 'missing', 1), value);
});

test('explicit save reloads only its account and pet key', async () => {
  const storage = store();
  const first = slideshowStorageKey({ id: 'first', mode: 'facebook' }, 'pet-a');
  const second = slideshowStorageKey({ id: 'second', mode: 'facebook' }, 'pet-a');
  const value = draft();
  await saveSlideshowDraft(storage, first, value, () => true);
  assert.deepEqual(await loadSlideshowDraft(storage, first, emptySlideshow('Fallback')), value);
  assert.deepEqual(await loadSlideshowDraft(storage, second, emptySlideshow('Other pet')), emptySlideshow('Other pet'));
});

test('an account change cancels a queued write and cannot replace the previously saved draft', async () => {
  const storage = store();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const realSave = storage.setItem;
  storage.setItem = async (key, value) => { await gate; await realSave(key, value); };
  const original = draft();
  const first = saveSlideshowDraft(storage, 'queued-owner', original, () => true);
  await new Promise(resolve => setImmediate(resolve));
  let active = true;
  const stale = saveSlideshowDraft(storage, 'queued-owner', { ...original, title: 'Stale edit' }, () => active);
  const rejected = assert.rejects(stale, /pet page changed/);
  active = false; release();
  await first; await rejected;
  assert.deepEqual(await loadSlideshowDraft(storage, 'queued-owner', emptySlideshow('Fallback')), original);
});

test('storage failures remain visible and later saves can recover', async () => {
  const storage = store();
  const realSave = storage.setItem;
  storage.setItem = async () => { throw new Error('Device storage full'); };
  await assert.rejects(saveSlideshowDraft(storage, 'storage-failure', draft(), () => true), /Device storage full/);
  storage.setItem = realSave;
  await saveSlideshowDraft(storage, 'storage-failure', draft(), () => true);
  assert.deepEqual(await loadSlideshowDraft(storage, 'storage-failure', emptySlideshow('Fallback')), draft());
});

test('corrupt or oversized saved slideshows do not silently load or overwrite their original value', async () => {
  const storage = store();
  storage.data.set('bad-json', '{bad');
  await assert.rejects(loadSlideshowDraft(storage, 'bad-json', draft()), /could not be opened/);
  assert.equal(storage.data.get('bad-json'), '{bad');
  storage.data.set('oversized', 'a'.repeat(1_800_001));
  await assert.rejects(loadSlideshowDraft(storage, 'oversized', draft()), /too large/);
});

test('removing a photo and saving replaces its persisted copy instead of merging it back', async () => {
  const storage = store();
  const original = { ...draft(), photos: [photo('keep'), { ...photo('remove'), caption: 'Remove this copy' }] };
  await saveSlideshowDraft(storage, 'photo-removal', original, () => true);
  await saveSlideshowDraft(storage, 'photo-removal', { ...original, photos: original.photos.filter(item => item.id !== 'remove') }, () => true);
  const restored = await loadSlideshowDraft(storage, 'photo-removal', emptySlideshow('Fallback'));
  assert.deepEqual(restored.photos.map(item => item.id), ['keep']);
  assert.doesNotMatch(storage.data.get('photo-removal'), /Remove this copy/);
});

test('explicit reset removes only the current owner and pet slideshow key', async () => {
  const storage = store();
  const target = slideshowStorageKey({ id: 'owner-one', mode: 'facebook' }, 'pet-one');
  const otherPet = slideshowStorageKey({ id: 'owner-one', mode: 'facebook' }, 'pet-two');
  const otherOwner = slideshowStorageKey({ id: 'owner-two', mode: 'facebook' }, 'pet-one');
  for (const key of [target, otherPet, otherOwner]) await saveSlideshowDraft(storage, key, draft(), () => true);
  await clearSlideshowDraft(storage, target, () => true);
  assert.equal(storage.data.has(target), false);
  assert.deepEqual(await loadSlideshowDraft(storage, target, emptySlideshow('New pet')), emptySlideshow('New pet'));
  assert.deepEqual(await loadSlideshowDraft(storage, otherPet, emptySlideshow('Fallback')), draft());
  assert.deepEqual(await loadSlideshowDraft(storage, otherOwner, emptySlideshow('Fallback')), draft());
});

test('reset waits for an in-flight save and a concurrent reload cannot resurrect the deleted photos', async () => {
  const storage = store();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const realSave = storage.setItem;
  storage.setItem = async (key, value) => { await gate; await realSave(key, value); };
  const saving = saveSlideshowDraft(storage, 'save-reset-race', draft(), () => true);
  await new Promise(resolve => setImmediate(resolve));
  const clearing = clearSlideshowDraft(storage, 'save-reset-race', () => true);
  const loading = loadSlideshowDraft(storage, 'save-reset-race', emptySlideshow('After reset'));
  release(); await saving; await clearing;
  assert.deepEqual(await loading, emptySlideshow('After reset'));
  assert.equal(storage.data.has('save-reset-race'), false);
});

test('an account change before queued reset prevents deletion', async () => {
  const storage = store();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const realSave = storage.setItem;
  storage.setItem = async (key, value) => { await gate; await realSave(key, value); };
  const saving = saveSlideshowDraft(storage, 'reset-scope-change', draft(), () => true);
  await new Promise(resolve => setImmediate(resolve));
  let active = true;
  const clearing = clearSlideshowDraft(storage, 'reset-scope-change', () => active);
  const rejected = assert.rejects(clearing, /pet page changed/);
  active = false; release(); await saving; await rejected;
  assert.equal(storage.data.has('reset-scope-change'), true);
});

test('failed deletion is reported and a retry can remove the saved photos', async () => {
  const storage = store();
  await saveSlideshowDraft(storage, 'failed-reset', draft(), () => true);
  const realRemove = storage.removeItem;
  storage.removeItem = async () => { throw new Error('Device deletion failed'); };
  await assert.rejects(clearSlideshowDraft(storage, 'failed-reset', () => true), /Device deletion failed/);
  assert.equal(storage.data.has('failed-reset'), true);
  storage.removeItem = realRemove;
  await clearSlideshowDraft(storage, 'failed-reset', () => true);
  assert.equal(storage.data.has('failed-reset'), false);
});
