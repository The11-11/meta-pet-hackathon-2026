import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { petNotificationPreferences } from '../../src/notificationData.ts';
import { refreshPetReminders, syncPetReminders } from '../../src/notificationSync.ts';

const NOW = Date.parse('2026-10-25T12:00:00.000Z');
const appointment = (index, extra = {}) => ({
  id: `visit-${index}`, title: `Vet visit ${index}`, date: new Date(NOW + index * 60_000).toISOString(), note: 'Owner note', ...extra,
});
const target = (extra = {}) => ({ petId: 'pet-kai', petName: 'Kai', enabled: true, sound: 'bark', appointments: [appointment(30)], ...extra });

function recorder(overrides = {}) {
  const events = [];
  const api = {
    cancelAllPetNotifications: async () => { events.push(['cancel-all']); },
    cancelPetNotification: async id => { events.push(['cancel', id]); },
    schedulePetAppointmentReminder: async input => { events.push(['schedule', input]); return `alert-${input.appointmentId}`; },
    ...overrides,
  };
  return { api, events };
}

test('notifications default to explicit opt-out with species-appropriate sounds', () => {
  for (const [species, sound] of [['Dog', 'bark'], ['Cat', 'meow'], ['Other', 'default'], ['dOg', 'bark'], ['CAT', 'meow'], ['', 'default']]) {
    assert.deepEqual(petNotificationPreferences(undefined, species), { enabled: false, sound });
  }
  for (const enabled of [false, undefined, null, 'true', 1, {}, []]) {
    assert.equal(petNotificationPreferences({ enabled }, 'Dog').enabled, false, 'truthy saved values must not grant notification permission');
  }
});

test('explicit valid preferences survive restoration while invalid fields use safe defaults', () => {
  for (const sound of ['bark', 'meow', 'default', 'silent']) {
    assert.deepEqual(petNotificationPreferences({ enabled: true, sound, token: 'discard' }, 'Dog'), { enabled: true, sound });
    assert.deepEqual(petNotificationPreferences({ enabled: false, sound }, 'Cat'), { enabled: false, sound });
  }
  for (const value of [null, false, 12, 'enabled', [], { enabled: 'yes', sound: 'quiet' }, { sound: 'constructor' }, { sound: '__proto__' }, { sound: {} }]) {
    assert.deepEqual(petNotificationPreferences(value, 'Cat'), { enabled: false, sound: 'meow' });
  }
  assert.deepEqual(petNotificationPreferences({ enabled: true, sound: 'unknown' }, 'Other'), { enabled: true, sound: 'default' });
});

test('sign-out, disabled preferences and stale scopes cancel app-owned alerts without scheduling', async () => {
  for (const [value, current] of [[null, true], [target({ enabled: false }), true], [target(), false]]) {
    const { api, events } = recorder();
    assert.equal(await syncPetReminders(value, api, () => current, NOW), 0);
    assert.deepEqual(events, [['cancel-all']]);
  }
});

test('a scope that becomes stale while old alerts are canceled cannot schedule', async () => {
  let current = true;
  const { api, events } = recorder({ cancelAllPetNotifications: async () => { events.push(['cancel-all']); current = false; } });
  assert.equal(await syncPetReminders(target(), api, () => current, NOW), 0);
  assert.deepEqual(events, [['cancel-all']]);
});

test('only valid future appointments are scheduled, nearest first, with a maximum of 50', async () => {
  const appointments = Array.from({ length: 60 }, (_, index) => appointment(index + 1)).reverse();
  appointments.splice(3, 0, appointment(-1), appointment(0), appointment(90, { id: 'invalid-date', date: 'not-a-date' }));
  const before = JSON.stringify(appointments);
  const { api, events } = recorder();
  assert.equal(await syncPetReminders(target({ appointments }), api, () => true, NOW), 50);
  assert.deepEqual(events[0], ['cancel-all'], 'previous alerts must be cleared before replacements are scheduled');
  const scheduled = events.filter(event => event[0] === 'schedule').map(event => event[1]);
  assert.deepEqual(scheduled.map(item => item.appointmentId), Array.from({ length: 50 }, (_, index) => `visit-${index + 1}`));
  assert.ok(scheduled.every(item => Date.parse(item.date) > NOW));
  assert.equal(JSON.stringify(appointments), before, 'sorting must not mutate saved care records');
});

test('the selected sound and matching pet/appointment details reach the native service unchanged', async () => {
  for (const sound of ['bark', 'meow', 'default', 'silent']) {
    const visit = appointment(40, { id: 'chosen-visit', title: 'Annual check-up', note: 'Not notification body data' });
    const value = target({ petId: 'chosen-pet', petName: 'Milo', sound, appointments: [visit] });
    const { api, events } = recorder();
    assert.equal(await syncPetReminders(value, api, () => true, NOW), 1);
    assert.deepEqual(events[1], ['schedule', { petId: 'chosen-pet', petName: 'Milo', appointmentId: 'chosen-visit', title: 'Annual check-up', date: visit.date, sound }]);
  }
});

test('an in-flight reminder is canceled by its returned ID after an owner change, even if the pet ID matches', async () => {
  let ownerRevision = 1;
  const expectedRevision = ownerRevision;
  let resolveSchedule; let signalSchedule;
  const entered = new Promise(resolve => { signalSchedule = resolve; });
  const pending = new Promise(resolve => { resolveSchedule = resolve; });
  const { api, events } = recorder({
    schedulePetAppointmentReminder: async input => { events.push(['schedule', input]); signalSchedule(); return pending; },
  });
  const value = target({ appointments: [appointment(30), appointment(60)] });
  const syncing = syncPetReminders(value, api, () => ownerRevision === expectedRevision, NOW);
  await entered;
  // The next account can use an equal pet ID; only the captured scope is proof.
  ownerRevision = 2;
  resolveSchedule('first-owner-alert-id');
  assert.equal(await syncing, 0);
  assert.deepEqual(events.map(event => event[0]), ['cancel-all', 'schedule', 'cancel']);
  assert.deepEqual(events.at(-1), ['cancel', 'first-owner-alert-id']);
});

test('cancellation failure prevents replacement scheduling and is reported to the caller', async () => {
  let scheduled = 0;
  const failure = new Error('The OS could not clear previous pet alerts.');
  const { api } = recorder({
    cancelAllPetNotifications: async () => { throw failure; },
    schedulePetAppointmentReminder: async () => { scheduled++; return 'must-not-exist'; },
  });
  await assert.rejects(syncPetReminders(target(), api, () => true, NOW), error => error === failure);
  assert.equal(scheduled, 0);
});

test('a service that cannot schedule returns zero instead of claiming notifications were created', async () => {
  const { api, events } = recorder({ schedulePetAppointmentReminder: async input => { events.push(['schedule', input]); return null; } });
  assert.equal(await syncPetReminders(target({ appointments: [appointment(30), appointment(60)] }), api, () => true, NOW), 0);
  assert.equal(events.filter(event => event[0] === 'schedule').length, 2);
  assert.equal(events.some(event => event[0] === 'cancel'), false);
});

for (const name of ['bark.wav', 'meow_v2.wav']) test(`${name} is a short unclipped PCM16 mono notification sound with silent edges`, async () => {
  const bytes = await readFile(new URL(`../../assets/sounds/${name}`, import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
  let format; let data;
  for (let position = 12; position + 8 <= bytes.length;) {
    const kind = bytes.toString('ascii', position, position + 4);
    const length = bytes.readUInt32LE(position + 4);
    assert.ok(position + 8 + length <= bytes.length, 'WAV chunk must fit the file');
    if (kind === 'fmt ') format = bytes.subarray(position + 8, position + 8 + length);
    if (kind === 'data') data = bytes.subarray(position + 8, position + 8 + length);
    position += 8 + length + length % 2;
  }
  assert.ok(format?.length >= 16 && data?.length > 0);
  assert.equal(format.readUInt16LE(0), 1, 'uncompressed PCM');
  assert.equal(format.readUInt16LE(2), 1, 'mono');
  assert.equal(format.readUInt32LE(4), 22_050);
  assert.equal(format.readUInt32LE(8), 44_100);
  assert.equal(format.readUInt16LE(12), 2);
  assert.equal(format.readUInt16LE(14), 16);
  assert.equal(data.length % 2, 0);
  const count = data.length / 2;
  assert.ok(count / 22_050 > 0.05 && count / 22_050 < 2);
  let peak = 0; let sum = 0; let squares = 0;
  for (let index = 0; index < count; index++) {
    const pcm = data.readInt16LE(index * 2);
    assert.ok(pcm > -32_768 && pcm < 32_767, 'sample must not clip');
    const sample = pcm / 32_768;
    peak = Math.max(peak, Math.abs(sample)); sum += sample; squares += sample * sample;
  }
  assert.ok(peak > 0.1 && peak <= 0.75, 'audible with modest headroom');
  assert.ok(Math.sqrt(squares / count) > 0.01, 'the file must contain a real tone');
  assert.ok(Math.abs(sum / count) < 0.0001, 'negligible DC offset');
  assert.equal(data.readInt16LE(0), 0);
  assert.equal(data.readInt16LE(data.length - 2), 0);
});


test('foreground permission revocation cancels own reminders while preserving explicit owner opt-in', async () => {
  const value = target();
  const { api, events } = recorder({ getPetNotificationPermission: async () => false });
  assert.deepEqual(await refreshPetReminders(value, api, () => true, NOW), { permission: false, count: 0 });
  assert.deepEqual(events, [['cancel-all']]);
  assert.equal(value.enabled, true, 'an OS setting must not silently replace the owner preference');
});

test('returning after an OS grant restores only the current opted-in owner reminders', async () => {
  for (const enabled of [true, false]) {
    const { api, events } = recorder({ getPetNotificationPermission: async () => true });
    assert.deepEqual(await refreshPetReminders(target({ enabled }), api, () => true, NOW), { permission: true, count: enabled ? 1 : 0 });
    assert.deepEqual(events.map(event => event[0]), enabled ? ['cancel-all', 'schedule'] : ['cancel-all']);
  }
});

test('an owner change during foreground permission lookup cannot cancel or schedule the next owner alerts', async () => {
  let current = true;
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const { api, events } = recorder({ getPetNotificationPermission: () => pending });
  const refreshing = refreshPetReminders(target(), api, () => current, NOW);
  current = false;
  finish(true);
  assert.deepEqual(await refreshing, { permission: null, count: 0 });
  assert.deepEqual(events, []);
});

test('a failed foreground permission read is not reported as an enabled or scheduled reminder', async () => {
  const failure = new Error('OS permission service unavailable');
  const { api, events } = recorder({ getPetNotificationPermission: async () => { throw failure; } });
  await assert.rejects(refreshPetReminders(target(), api, () => true, NOW), error => error === failure);
  assert.deepEqual(events, []);
});
