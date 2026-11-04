import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../../src/petPhoto.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
function photoService(os = 'android') {
  const state = { permission: { granted: false, canAskAgain: true }, requested: { granted: false, canAskAgain: false }, cameraReads: 0, photoReads: 0, prompts: 0, opens: [], settings: 0, failure: null };
  const picker = {
    getCameraPermissionsAsync: async () => { state.cameraReads++; return state.permission; },
    requestCameraPermissionsAsync: async () => { state.prompts++; return state.permission = state.requested; },
    getMediaLibraryPermissionsAsync: async () => { state.photoReads++; return state.permission; },
    launchCameraAsync: async () => { state.opens.push('camera'); if (state.failure) throw state.failure; return { canceled: true, assets: null }; },
    launchImageLibraryAsync: async () => { state.opens.push('library'); if (state.failure) throw state.failure; return { canceled: true, assets: null }; },
  };
  const exports = {};
  runInNewContext(code, { exports, require(name) {
    if (name === 'expo-image-picker') return picker;
    if (name === 'expo-image-manipulator') return { ImageManipulator: {}, SaveFormat: {} };
    if (name === 'react-native') return { Platform: { OS: os } };
    if (name === 'expo-linking') return { openSettings: async () => { state.settings++; } };
    if (name === './petAvatarData') return { parsePetAvatar: value => value };
    throw new Error('Unexpected photo dependency: ' + name);
  } });
  return { api: exports, state };
}

test('permanently denied camera gives Settings recovery without another prompt or camera launch', async () => {
  const { api, state } = photoService();
  state.permission = { granted: false, canAskAgain: false };
  await assert.rejects(api.pickPetPhoto('camera'), failure => api.petPhotoNeedsSettings(failure) && /Open phone settings/.test(failure.message));
  assert.equal(state.prompts, 0);
  assert.deepEqual(state.opens, []);
  assert.equal(state.settings, 0, 'Settings must open only from a separate explicit button');
});

test('an explicit camera choice prompts once when allowed and can recover after a Settings grant', async () => {
  const { api, state } = photoService('ios');
  await assert.rejects(api.pickPetPhoto('camera'), failure => api.petPhotoNeedsSettings(failure));
  assert.equal(state.prompts, 1);
  state.permission = { granted: true, canAskAgain: true };
  assert.equal(await api.pickPetPhoto('camera'), null);
  assert.equal(state.prompts, 1);
  assert.deepEqual(state.opens, ['camera']);
});

test('a retryable camera denial offers the existing alternative without directing to Settings', async () => {
  const { api, state } = photoService();
  state.requested = { granted: false, canAskAgain: true };
  await assert.rejects(api.pickPetPhoto('camera'), failure => !api.petPhotoNeedsSettings(failure) && /choose a photo instead/.test(failure.message));
  assert.equal(state.prompts, 1);
  assert.deepEqual(state.opens, []);
});

test('modern photo picker opens without a broad library or camera permission request', async () => {
  const { api, state } = photoService('ios');
  assert.equal(await api.pickPetPhoto('library'), null);
  assert.deepEqual(state.opens, ['library']);
  assert.equal(state.cameraReads + state.photoReads + state.prompts, 0);
});

test('a native permission failure offers Settings only after a read confirms permanent denial', async () => {
  const { api, state } = photoService();
  state.permission = { granted: false, canAskAgain: false };
  state.failure = Object.assign(new Error('Photo permission rejected'), { code: 'ERR_USER_REJECTED_PERMISSIONS' });
  await assert.rejects(api.pickPetPhoto('library'), failure => api.petPhotoNeedsSettings(failure) && /Photo access is blocked/.test(failure.message));
  assert.equal(state.photoReads, 1);
  assert.equal(state.prompts, 0);
  state.failure = new Error('Picker unavailable');
  await assert.rejects(api.pickPetPhoto('library'), failure => failure === state.failure);
  assert.equal(state.photoReads, 1, 'unrelated picker failures must not be presented as permission denial');
});

test('Settings opens only explicitly on native, while web photo launches keep their user gesture', async () => {
  const native = photoService();
  await native.api.openPetPhotoSettings();
  assert.equal(native.state.settings, 1);
  assert.deepEqual(native.state.opens, []);
  const web = photoService('web');
  const pending = web.api.pickPetPhoto('camera');
  assert.deepEqual(web.state.opens, ['camera'], 'web picker launch must happen before the first asynchronous boundary');
  await pending;
  await web.api.openPetPhotoSettings();
  assert.equal(web.state.settings, 0);
  assert.equal(web.state.cameraReads + web.state.photoReads + web.state.prompts, 0);
});
