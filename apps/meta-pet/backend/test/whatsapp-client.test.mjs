import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelWhatsAppReminder, disconnectWhatsApp, futureSastWalkTime, getWhatsAppConfig, getWhatsAppStatus, pairWhatsApp,
  parseWhatsAppConfig, parseWhatsAppPairing, parseWhatsAppStatus, scheduleWhatsAppReminder, validatedWhatsAppPairingLink,
  whatsAppReminderKey, whatsAppReminderLabels,
} from '../../src/whatsappClient.ts';

const base = 'https://muse.example';
const session = { ownerId: 'test-owner', transport: { credentials: 'include', headers: { 'X-Muse-Owner': 'test-owner' } } };
const config = { enabled: true, configured: true, available: true, status: 'configured', message: 'Server setup available.' };
const id = 'a'.repeat(64);
const eventAt = new Date(Date.now() + 3_600_000).toISOString();
const reminder = { id, petId: 'pet-1', clientReminderId: 'appointment-test', kind: 'appointment', eventAt, scheduledFor: eventAt, state: 'scheduled', errorCode: null };
const status = { ...config, connected: true, recipientLabel: '••••1234', preferences: { appointmentAlerts: true, walkAlerts: false }, pendingPairing: null, reminders: [reminder] };
const pairing = () => ({ connected: false, consentVersion: 'pet-alerts-v1', pairing: { link: `https://wa.me/27820000000?text=START%20${'A'.repeat(32)}`, expiresAt: new Date(Date.now() + 600_000).toISOString() } });
const signal = () => new AbortController().signal;

test('WhatsApp readiness never treats disabled/setup-required as available or delivery-proven', () => {
  assert.deepEqual(parseWhatsAppConfig(config), config);
  assert.equal(parseWhatsAppConfig({ ...config, enabled: false, available: false, status: 'disabled' }).available, false);
  assert.equal(parseWhatsAppConfig({ ...config, configured: false, available: false, status: 'setup_required' }).available, false);
  for (const bad of [{ ...config, available: false }, { ...config, enabled: 'true' }, { ...config, status: 'ready' }]) assert.throws(() => parseWhatsAppConfig(bad));
});

test('WhatsApp status accepts all exact delivery states and rejects raw numbers, unknown states or unbounded rows', () => {
  assert.deepEqual(parseWhatsAppStatus(status), status);
  const minuteOnly = new Date(Date.now() + 3_600_000).toISOString().slice(0, 16) + 'Z';
  assert.equal(parseWhatsAppStatus({ ...status, reminders: [{ ...reminder, eventAt: minuteOnly }] }).reminders[0].eventAt, minuteOnly);
  for (const state of Object.keys(whatsAppReminderLabels)) assert.equal(parseWhatsAppStatus({ ...status, reminders: [{ ...reminder, state }] }).reminders[0].state, state);
  for (const bad of [
    { ...status, recipientLabel: '+27820001234' }, { ...status, preferences: { appointmentAlerts: false, walkAlerts: false } },
    { ...status, reminders: [{ ...reminder, state: 'done' }] }, { ...status, reminders: Array(51).fill(reminder) },
    { ...status, pendingPairing: { link: pairing().pairing.link } },
  ]) assert.throws(() => parseWhatsAppStatus(bad));
  const off = parseWhatsAppStatus({ ...status, connected: false, recipientLabel: null, preferences: { appointmentAlerts: false, walkAlerts: false }, reminders: [] });
  assert.equal(off.connected, false);
  assert.match(whatsAppReminderLabels.accepted, /delivery not confirmed/);
  assert.match(whatsAppReminderLabels.delivery_unknown, /refresh before retrying/);
});

test('only exact short-lived wa.me START links are accepted, without opening or sending anything', () => {
  assert.equal(parseWhatsAppPairing(pairing()).link, pairing().pairing.link);
  const code = 'A'.repeat(32);
  for (const bad of [
    `http://wa.me/27820000000?text=START%20${code}`, `https://wa.me.attacker.example/27820000000?text=START%20${code}`,
    `https://wa.me@attacker.example/27820000000?text=START%20${code}`, `https://wa.me:444/27820000000?text=START%20${code}`,
    `https://wa.me/27820000000?text=START%20${code}#extra`, `https://wa.me/27820000000?text=START%20${code}&text=another`,
    `https://wa.me/27820000000?text=START%20${code}&next=https://attacker.example`, `https://wa.me/27820000000?text=hello`,
    `https://wa.me/+27820000000?text=START%20${code}`, 'javascript:alert(1)',
  ]) assert.throws(() => validatedWhatsAppPairingLink(bad));
  for (const delta of [-1, 12 * 60_000]) assert.throws(() => parseWhatsAppPairing({ ...pairing(), pairing: { ...pairing().pairing, expiresAt: new Date(Date.now() + delta).toISOString() } }));
});

test('WhatsApp public config omits credentials; each protected endpoint keeps exact owner and cookie with no token fallback', async context => {
  const requests = [];
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/config')) return Response.json(config);
    if (url.endsWith('/status')) return Response.json(status);
    if (url.endsWith('/pair')) return Response.json(pairing());
    if (url.endsWith('/reminders/cancel')) return Response.json({ reminder: { ...reminder, state: 'cancelled' } });
    if (url.endsWith('/disconnect')) return Response.json({ connected: false, cancelledQueued: 1 });
    return Response.json({ scheduled: true, reused: false, reminder });
  });
  await getWhatsAppConfig(base, signal());
  assert.equal(requests.shift().options.credentials, 'omit');
  const native = { ownerId: session.ownerId, transport: { credentials: 'omit', headers: { 'x-muse-owner': session.ownerId, Cookie: 'synthetic-cookie', Authorization: 'Bearer MUST-NOT-SEND' } } };
  for (const auth of [session, native]) {
    await getWhatsAppStatus(base, auth, signal());
    await pairWhatsApp(base, auth, { appointmentAlerts: true, walkAlerts: false }, signal());
    await scheduleWhatsAppReminder(base, auth, { petId: reminder.petId, clientReminderId: reminder.clientReminderId, petName: 'Demo Pet', kind: 'appointment', eventAt, leadMinutes: 0, timeZone: 'Africa/Johannesburg' }, signal());
    await cancelWhatsAppReminder(base, auth, id, signal());
    await disconnectWhatsApp(base, auth, signal());
  }
  for (const { url, options } of requests) {
    assert.ok(url.startsWith(`${base}/api/whatsapp/`)); assert.equal(options.headers['X-Muse-Owner'], session.ownerId);
    assert.equal(options.headers.Authorization, undefined); assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    if (options.credentials === 'omit') assert.equal(options.headers.Cookie, 'synthetic-cookie');
    if (url.endsWith('/pair')) assert.deepEqual(JSON.parse(options.body), { consent: true, appointmentAlerts: true, walkAlerts: false });
  }
});

test('missing, mismatched and token-only sessions are rejected before any network call', async context => {
  let calls = 0; context.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json(status); });
  for (const invalid of [undefined, { ownerId: 'other-owner', transport: session.transport }, { ownerId: session.ownerId, transport: { credentials: 'omit', headers: { 'X-Muse-Owner': session.ownerId, Authorization: 'Bearer demo' } } }, { ownerId: session.ownerId, transport: { credentials: 'include' } }]) {
    await assert.rejects(() => getWhatsAppStatus(base, invalid, signal()), /Sign in with Facebook/);
  }
  assert.equal(calls, 0);
});

test('aborted requests reject before fetch and discard responses arriving after abort', async context => {
  const before = new AbortController(); before.abort(); let calls = 0;
  context.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json(status); });
  await assert.rejects(() => getWhatsAppStatus(base, session, before.signal), /cancelled/); assert.equal(calls, 0);
  const during = new AbortController();
  context.mock.method(globalThis, 'fetch', async () => { during.abort(); return Response.json(status); });
  await assert.rejects(() => getWhatsAppStatus(base, session, during.signal), /cancelled/);
});

test('errors never display provider bodies or imply a failed check scheduled an alert', async context => {
  for (const code of [401, 403, 503, 409, 500]) {
    context.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'PRIVATE PROVIDER DETAIL' }, { status: code }));
    await assert.rejects(() => getWhatsAppStatus(base, session, signal()), error => !/PRIVATE/.test(error.message) && (code !== 401 || /Sign in with Facebook again/.test(error.message)));
  }
});

test('a future SAST walk round-trips strict calendar dates and remains an alert input only', () => {
  const now = Date.parse('2026-11-03T07:00:00Z');
  assert.equal(futureSastWalkTime('2026-11-03 10:00', now), '2026-11-03T10:00:00+02:00');
  for (const bad of ['2026-11-03 08:59', '2026-11-03 09:00', '2026-02-30 10:00', '2026-13-01 10:00', '2026-11-04 24:00', 'tomorrow', '2026-11-04T10:00Z']) assert.equal(futureSastWalkTime(bad, now), null);
  const key = whatsAppReminderKey('walk', ['pet-1', '2026-11-04T10:00:00+02:00', '15']);
  assert.match(key, /^walk-[a-f0-9]{16}$/);
  assert.equal(key, whatsAppReminderKey('walk', ['pet-1', '2026-11-04T10:00:00+02:00', '15']));
  assert.notEqual(key, whatsAppReminderKey('walk', ['pet-2', '2026-11-04T10:00:00+02:00', '15']));
});

test('invalid schedules and opt-ins fail locally; mismatched schedule acknowledgements are rejected', async context => {
  let calls = 0; context.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ scheduled: true, reused: false, reminder: { ...reminder, petId: 'different-pet' } }); });
  await assert.rejects(() => pairWhatsApp(base, session, { appointmentAlerts: false, walkAlerts: false }, signal()));
  const input = { petId: reminder.petId, clientReminderId: reminder.clientReminderId, petName: 'Demo Pet', kind: 'appointment', eventAt, leadMinutes: 15, timeZone: 'Africa/Johannesburg' };
  for (const changed of [{ eventAt: '2020-01-01T10:00:00Z' }, { petId: 'pet:bad' }, { timeZone: 'UTC' }, { petName: 'Pet\nprivate note' }]) await assert.rejects(() => scheduleWhatsAppReminder(base, session, { ...input, ...changed }, signal()));
  assert.equal(calls, 0);
  await assert.rejects(() => scheduleWhatsAppReminder(base, session, input, signal()), /unexpected response/);
});
