import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the actual platform service with phone APIs replaced, without loading
// React Native in Node or requesting any real permissions/tokens. Transpilation
// only removes TS syntax and converts its imports to this explicit stub boundary.
function compile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
}
const nativeCode = compile('../../src/petNotifications.native.ts');
const webCode = compile('../../src/petNotifications.web.ts');
const now = Date.parse('2026-10-25T12:00:00.000Z');
const pet = { petId: 'pet-a', petName: 'Milo', sound: 'bark' };
const visit = { ...pet, appointmentId: 'visit-a', title: 'Vet visit', date: new Date(now + 30 * 60_000).toISOString() };
const plain = value => JSON.parse(JSON.stringify(value));
const saved = (identifier, petId, source = 'muse-pet') => ({ identifier, content: { data: { source, petId } } });

function nativeService({ os = 'android', expoGo = false, sounds = ['assets/sounds/bark.wav', 'assets/sounds/meow_v2.wav'], permission = { granted: false, canAskAgain: true } } = {}) {
  const state = {
    now, imports: 0, permissionReads: 0, prompts: [], channels: new Map(), channelWrites: [],
    requests: [], scheduled: [], presented: [], canceled: [], dismissed: [], handler: null,
    permission, beforeSchedule: null,
  };
  const module = {
    AndroidImportance: { DEFAULT: 5, HIGH: 6 }, AndroidNotificationVisibility: { PRIVATE: 2 },
    IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
    SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
    setNotificationHandler(handler) { state.handler = handler; },
    async getPermissionsAsync() { state.permissionReads++; return state.permission; },
    async requestPermissionsAsync(options) {
      state.prompts.push(options);
      return state.permission = { granted: true, canAskAgain: true };
    },
    async getNotificationChannelAsync(id) { return state.channels.get(id) ?? null; },
    async setNotificationChannelAsync(id, channel) {
      state.channelWrites.push(id); state.channels.set(id, channel); return channel;
    },
    async scheduleNotificationAsync(request) {
      state.requests.push(request);
      if (state.beforeSchedule) await state.beforeSchedule();
      const identifier = request.identifier ?? `notification-${state.requests.length}`;
      state.scheduled = [...state.scheduled.filter(item => item.identifier !== identifier), { ...request, identifier }];
      return identifier;
    },
    async cancelScheduledNotificationAsync(id) {
      state.canceled.push(id); state.scheduled = state.scheduled.filter(item => item.identifier !== id);
    },
    async dismissNotificationAsync(id) {
      state.dismissed.push(id); state.presented = state.presented.filter(item => item.request.identifier !== id);
    },
    async getAllScheduledNotificationsAsync() { return state.scheduled; },
    async getPresentedNotificationsAsync() { return state.presented; },
  };
  const exports = {};
  runInNewContext(nativeCode, {
    exports,
    Date: class extends Date { static now() { return state.now; } },
    require(name) {
      if (name === 'expo') return { isRunningInExpoGo: () => expoGo };
      if (name === 'expo-constants') return { __esModule: true, default: { expoConfig: { plugins: [['expo-notifications', { sounds }]] } } };
      if (name === 'react-native') return { Platform: { OS: os } };
      if (name === './petNotifications.web') return { PET_NOTIFICATION_PREVIEW_MESSAGE: 'Sound preview only on web.' };
      if (name === 'expo-notifications') { state.imports++; return module; }
      throw new Error(`Unexpected service dependency: ${name}`);
    },
  }, { filename: 'petNotifications.native.cjs' });
  return { api: exports, state };
}

test('importing pet notification service does not load native notifications or read/request permission', () => {
  const { state } = nativeService();
  assert.equal(state.imports, 0);
  assert.equal(state.permissionReads, 0);
  assert.equal(state.prompts.length, 0);
  assert.equal(state.channels.size, 0);
});

test('explicit enable creates four immutable sound choices and requests permission once', async () => {
  const { api, state } = nativeService();
  assert.equal(await api.requestPetNotificationPermission(), true);
  assert.deepEqual([...state.channels.keys()], ['muse-bark-v1', 'muse-meow-v2', 'muse-default-v1', 'muse-silent-v1']);
  assert.deepEqual([...state.channels.values()].map(channel => channel.sound), ['bark.wav', 'meow_v2.wav', 'default', null]);
  assert.equal(state.channels.get('muse-silent-v1').enableVibrate, false);
  assert.ok([...state.channels.values()].every(channel => channel.bypassDnd === false));
  assert.deepEqual(plain(state.prompts), [{ ios: { allowAlert: true, allowSound: true, allowBadge: false } }]);
  // User changes to an existing Android channel must survive subsequent enable.
  state.channels.get('muse-bark-v1').sound = null;
  assert.equal(await api.requestPetNotificationPermission(), true);
  assert.equal(state.channels.get('muse-bark-v1').sound, null);
  assert.equal(state.channelWrites.length, 4);
  assert.equal(state.prompts.length, 1);
});

test('denied permission never causes test/reminder scheduling or an automatic prompt', async () => {
  const { api, state } = nativeService({ permission: { granted: false, canAskAgain: false } });
  await assert.rejects(api.schedulePetTestNotification(pet), /Enable pet notifications/);
  assert.equal(await api.schedulePetAppointmentReminder(visit), null);
  assert.equal(state.prompts.length, 0);
  assert.equal(state.requests.length, 0);
  assert.equal(await api.requestPetNotificationPermission(), false);
  assert.equal(state.prompts.length, 0, 'an OS denial that cannot be asked again requires phone settings');
});

test('replacement cat alerts use a new asset and channel while the approved dog and legacy channel stay unchanged', async () => {
  const { api, state } = nativeService({ permission: { granted: true, canAskAgain: true } });
  const previousCatChannel = { name: 'Legacy meow', sound: 'meow.wav' };
  state.channels.set('muse-meow-v1', previousCatChannel);
  await api.schedulePetTestNotification({ ...pet, sound: 'meow' });
  assert.equal(state.channels.get('muse-meow-v1'), previousCatChannel);
  assert.equal(state.channels.get('muse-meow-v2').sound, 'meow_v2.wav');
  assert.equal(state.channels.get('muse-bark-v1').sound, 'bark.wav');
  assert.equal(state.requests[0].content.sound, 'meow_v2.wav');
  assert.equal(state.requests[0].trigger.channelId, 'muse-meow-v2');
});

test('Expo Go and a build without declared sounds report the build requirement before prompting', async () => {
  for (const options of [{ expoGo: true }, { sounds: [] }, { sounds: ['assets/sounds/bark.wav'] }, { sounds: ['assets/sounds/bark.wav', 'assets/sounds/meow.wav'] }]) {
    const { api, state } = nativeService(options);
    await assert.rejects(api.requestPetNotificationPermission(), /app build with its sound files/);
    await assert.rejects(api.schedulePetTestNotification(pet), /app build with its sound files/);
    assert.equal(state.imports, 0);
    assert.equal(state.prompts.length, 0);
    assert.equal(state.requests.length, 0);
  }
});

test('local tests request a one-off two-second trigger with the selected sound/channel', async () => {
  const { api, state } = nativeService({ permission: { granted: true, canAskAgain: true } });
  assert.equal(await api.schedulePetTestNotification(pet), 'notification-1');
  assert.deepEqual(plain(state.requests[0].trigger), { type: 'timeInterval', seconds: 2, repeats: false, channelId: 'muse-bark-v1' });
  assert.equal(state.requests[0].content.sound, 'bark.wav');
  assert.deepEqual(plain(state.requests[0].content.data), { source: 'muse-pet', kind: 'test', petId: pet.petId, sound: 'bark' });
  await api.schedulePetTestNotification({ ...pet, sound: 'silent' });
  assert.equal(state.requests[1].content.sound, false);
  assert.equal(state.requests[1].trigger.channelId, 'muse-silent-v1');
  assert.equal(state.prompts.length, 0);
});

test('foreground Quiet keeps the list entry without audio/banner; unrelated notifications stay suppressed', async () => {
  const { api, state } = nativeService({ permission: { granted: true, canAskAgain: true } });
  await api.schedulePetTestNotification(pet);
  const behavior = data => state.handler.handleNotification({ request: { content: { data } } });
  assert.deepEqual(plain(await behavior({ source: 'muse-pet', sound: 'bark' })), { shouldPlaySound: true, shouldShowBanner: true, shouldShowList: true, shouldSetBadge: false });
  assert.deepEqual(plain(await behavior({ source: 'muse-pet', sound: 'silent' })), { shouldPlaySound: false, shouldShowBanner: false, shouldShowList: true, shouldSetBadge: false });
  assert.deepEqual(plain(await behavior(undefined)), { shouldPlaySound: false, shouldShowBanner: false, shouldShowList: false, shouldSetBadge: false });
});

test('reminders aim for fifteen minutes before, fall back to appointment time, and replace the same appointment', async () => {
  const { api, state } = nativeService({ permission: { granted: true, canAskAgain: true } });
  const firstId = await api.schedulePetAppointmentReminder(visit);
  // Standard DATE triggers let SDK57 use its inexact Android fallback; this
  // service does not request special exact-alarm access or promise delivery time.
  assert.deepEqual(plain(state.requests[0].trigger), { type: 'date', date: new Date(now + 15 * 60_000).toISOString(), channelId: 'muse-bark-v1' });
  assert.equal(await api.schedulePetAppointmentReminder({ ...visit, date: new Date(now + 5 * 60_000).toISOString() }), firstId);
  assert.equal(state.requests[1].trigger.date.getTime(), now + 5 * 60_000);
  assert.equal(state.scheduled.length, 1);
  assert.equal(await api.schedulePetAppointmentReminder({ ...visit, date: new Date(now - 1).toISOString() }), null);
  assert.equal(state.requests.length, 2);
  assert.equal(state.prompts.length, 0);
});

test('iOS provisional authorization permits a local meow alert with the bundled filename', async () => {
  const { api, state } = nativeService({ os: 'ios', permission: { granted: false, canAskAgain: true, ios: { status: 3 } } });
  await api.schedulePetTestNotification({ ...pet, sound: 'meow' });
  assert.equal(state.requests[0].content.sound, 'meow_v2.wav');
  assert.equal(Object.hasOwn(state.requests[0].trigger, 'channelId'), false);
  assert.equal(state.channels.size, 0);
  assert.equal(state.prompts.length, 0);
});

test('cancel-by-pet and cold-start cancel-all find persisted own alerts without touching unrelated ones', async () => {
  const { api, state } = nativeService();
  state.scheduled = [saved('own-a', 'pet-a'), saved('own-b', 'pet-b'), saved('unrelated', 'pet-a', 'other'), { identifier: 'no-data', content: {} }];
  state.presented = [{ request: saved('shown-a', 'pet-a') }, { request: saved('shown-other', 'pet-a', 'other') }];
  await api.cancelPetNotificationsForPet('pet-a');
  assert.deepEqual(state.canceled, ['own-a']);
  assert.deepEqual(state.dismissed, ['shown-a']);
  await api.cancelAllPetNotifications();
  assert.deepEqual(state.canceled, ['own-a', 'own-b']);
  assert.deepEqual(state.scheduled.map(item => item.identifier), ['unrelated', 'no-data']);
  assert.equal(state.presented[0].request.identifier, 'shown-other');
  assert.equal(state.permissionReads, 0);
  assert.equal(state.prompts.length, 0);
});

for (const cancel of ['cancelAllPetNotifications', 'cancelPetNotificationsForPet']) {
  test(`${cancel} wins a race with an in-flight test and appointment schedule`, { timeout: 2_000 }, async () => {
    for (const appointment of [false, true]) {
      const { api, state } = nativeService({ permission: { granted: true, canAskAgain: true } });
      let started;
      let release;
      const entered = new Promise(resolve => { started = resolve; });
      const pending = new Promise(resolve => { release = resolve; });
      state.beforeSchedule = async () => { started(); await pending; };
      const scheduling = appointment ? api.schedulePetAppointmentReminder(visit) : api.schedulePetTestNotification(pet);
      await entered;
      await api[cancel](pet.petId);
      release();
      if (appointment) assert.equal(await scheduling, null);
      else await assert.rejects(scheduling, /Pet alerts changed/);
      assert.equal(state.canceled.length, 1);
      assert.equal(state.scheduled.length, 0, 'sign-out/pet change must not leave a newly completed alert behind');
    }
  });
}

test('web only reports previews and never loads an OS notification API', async () => {
  const exports = {};
  runInNewContext(webCode, { exports, require(name) { throw new Error(`Web must not import native dependency: ${name}`); } });
  assert.equal(await exports.requestPetNotificationPermission(), false);
  await assert.rejects(exports.schedulePetTestNotification(pet), /Sound preview only on web/);
  assert.equal(await exports.schedulePetAppointmentReminder(visit), null);
  await exports.cancelPetNotification('any');
  await exports.cancelPetNotificationsForPet(pet.petId);
  await exports.cancelAllPetNotifications();
});


test('foreground notification permission reads never prompt or create Android channels', async () => {
  const { api, state } = nativeService({ permission: { granted: true, canAskAgain: true } });
  assert.equal(await api.getPetNotificationPermission(), true);
  state.permission = { granted: false, canAskAgain: false };
  assert.equal(await api.getPetNotificationPermission(), false);
  assert.equal(state.prompts.length, 0);
  assert.equal(state.channels.size, 0);
  assert.equal(state.requests.length, 0);
  const preview = nativeService({ expoGo: true });
  assert.equal(await preview.api.getPetNotificationPermission(), false);
  assert.equal(preview.state.imports, 0);
});
