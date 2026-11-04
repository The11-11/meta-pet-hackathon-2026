import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { createWhatsAppService } from '../src/whatsapp.mjs';
import { createWhatsAppStore } from '../src/whatsapp-store.mjs';
import { readWhatsAppConfiguration, validateReminder, WHATSAPP_TEMPLATE_BODY } from '../src/whatsapp-core.mjs';
import { createMuseServer } from '../src/server.mjs';

// Disposable identities, numbers, secrets and provider responses; no real messages.
const initialNow = Date.parse('2026-11-03T09:00:00Z');
const number = '15555550123';
const env = {
  WHATSAPP_ENABLED: 'true', WHATSAPP_BUSINESS_ACCOUNT_ID: '123456789', WHATSAPP_PHONE_NUMBER_ID: '987654321',
  WHATSAPP_SENDER_NUMBER: '15555550999', WHATSAPP_ACCESS_TOKEN: 'fixture-only-access-token-not-real',
  WHATSAPP_APP_SECRET: 'fixture-only-app-secret-not-real', WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'fixture-only-verification-token-more-than-32',
  WHATSAPP_GRAPH_VERSION: 'v25.0', WHATSAPP_TEMPLATE_NAME: 'fixture_pet_reminder', WHATSAPP_TEMPLATE_LANGUAGE: 'en',
  WHATSAPP_DATABASE_PATH: resolve(tmpdir(), 'fixture-unused-supplied-store.sqlite'), WHATSAPP_DATA_ENCRYPTION_KEY: 'ab'.repeat(32),
};
const template = (overrides = {}) => ({ name: env.WHATSAPP_TEMPLATE_NAME, language: 'en', category: 'UTILITY', status: 'APPROVED', components: [{ type: 'BODY', text: WHATSAPP_TEMPLATE_BODY }], ...overrides });
const approved = () => Response.json({ data: [template()] });
const reminder = (overrides = {}) => ({ petId: 'fixture-pet', clientReminderId: 'fixture-reminder', petName: 'Fixture pet', kind: 'appointment', eventAt: new Date(initialNow + 120_000).toISOString(), leadMinutes: 0, timeZone: 'Africa/Johannesburg', ...overrides });
function fixture(fetchImpl = async (_url, options) => options.method === 'GET' ? approved() : Response.json({ messages: [{ id: 'wamid.fixture-accepted' }] }), options = {}) {
  let clock = initialNow;
  const store = createWhatsAppStore({ databasePath: options.databasePath ?? ':memory:', encryptionKey: env.WHATSAPP_DATA_ENCRYPTION_KEY });
  const service = createWhatsAppService({ env, store, fetchImpl, now: () => clock });
  return { service, store, setNow: value => { clock = value; } };
}
let eventSequence = 0;
function inbound(text, from = number, id = 'wamid.inbound-' + ++eventSequence) {
  return { object: 'whatsapp_business_account', entry: [{ id: env.WHATSAPP_BUSINESS_ACCOUNT_ID, changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID }, messages: [{ id, type: 'text', from, text: { body: text } }] } }] }] };
}
function signed(body) { const raw = Buffer.from(JSON.stringify(body)); return { raw, signature: 'sha256=' + createHmac('sha256', env.WHATSAPP_APP_SECRET).update(raw).digest('hex') }; }
function deliver(service, body) { const { raw, signature } = signed(body); return service.webhook(raw, signature); }
function pair(service, owner = 'owner-a', from = number, preferences = { appointmentAlerts: true, walkAlerts: false }) {
  const result = service.pair(owner, { consent: true, ...preferences });
  const text = new URL(result.pairing.link).searchParams.get('text'); deliver(service, inbound(text, from)); return result;
}
function statusEvent(state, timestamp, id = 'wamid.fixture-accepted', recipientId = number) {
  const body = inbound('ignored'); const value = body.entry[0].changes[0].value; delete value.messages;
  value.statuses = [{ id, status: state, timestamp: String(Math.floor(timestamp / 1000)), recipient_id: recipientId }]; return body;
}

test('disabled and incomplete setup create no provider calls or connection promises', async () => {
  let calls = 0; const service = createWhatsAppService({ env: {}, fetchImpl: async () => { calls++; throw new Error('never'); } });
  try {
    assert.deepEqual(service.getConfig(), { enabled: false, configured: false, available: false, status: 'disabled', message: 'WhatsApp is not linked yet. Phone alerts remain separate.' });
    assert.equal(service.status('owner-a').connected, false); assert.deepEqual(service.status('owner-a').reminders, []);
    assert.throws(() => service.pair('owner-a', { consent: true, appointmentAlerts: true, walkAlerts: false }), error => error.status === 503);
    assert.deepEqual(await service.drainDue(), { accepted: 0 }); assert.equal(calls, 0);
    assert.equal(readWhatsAppConfiguration({ ...env, WHATSAPP_ACCESS_TOKEN: '' }).configured, false);
    assert.equal(readWhatsAppConfiguration({ ...env, WHATSAPP_ENABLED: 'false' }).available, false);
  } finally { await service.close(); }
});

test('pairing requires explicit scoped consent and makes a bounded one-use link', async () => {
  const { service, setNow } = fixture();
  try {
    assert.throws(() => service.pair('owner-a', { consent: false, appointmentAlerts: true, walkAlerts: false }), error => error.code === 'opt_in_required');
    assert.throws(() => service.pair('owner-a', { consent: true, appointmentAlerts: false, walkAlerts: false }), error => error.code === 'opt_in_required');
    const result = service.pair('owner-a', { consent: true, appointmentAlerts: true, walkAlerts: false });
    assert.match(result.pairing.link, /^https:\/\/wa\.me\/15555550999\?text=START%20[A-F0-9]{32}$/);
    assert.equal(Date.parse(result.pairing.expiresAt), initialNow + 600_000); assert.equal(service.status('owner-a').connected, false);
    const message = inbound(new URL(result.pairing.link).searchParams.get('text')); deliver(service, message);
    assert.equal(service.status('owner-a').connected, true); assert.equal(service.status('owner-b').connected, false);
    service.disconnect('owner-a'); deliver(service, message); assert.equal(service.status('owner-a').connected, false);
    const expired = service.pair('owner-a', { consent: true, appointmentAlerts: true, walkAlerts: false }); setNow(initialNow + 600_001);
    deliver(service, inbound(new URL(expired.pairing.link).searchParams.get('text'))); assert.equal(service.status('owner-a').connected, false);
  } finally { await service.close(); }
});

test('raw signature and exact WABA/sender binding protect pairing', async () => {
  const { service } = fixture();
  try {
    const request = service.pair('owner-a', { consent: true, appointmentAlerts: true, walkAlerts: false });
    const body = inbound(new URL(request.pairing.link).searchParams.get('text')); const { signature } = signed(body);
    assert.throws(() => service.webhook(Buffer.from(JSON.stringify(body, null, 2)), signature), error => error.code === 'webhook_signature_invalid');
    for (const change of ['waba', 'phone']) { const wrong = structuredClone(body); if (change === 'waba') wrong.entry[0].id = '11111111'; else wrong.entry[0].changes[0].value.metadata.phone_number_id = '11111111'; deliver(service, wrong); }
    assert.equal(service.status('owner-a').connected, false); deliver(service, body); assert.equal(service.status('owner-a').connected, true);
    assert.equal(JSON.stringify(service.status('owner-a')).includes(number), false);
  } finally { await service.close(); }
});

test('a verified number cannot be silently transferred to another owner', async () => {
  const { service } = fixture();
  try { pair(service); pair(service, 'owner-b'); assert.equal(service.status('owner-a').connected, true); assert.equal(service.status('owner-b').connected, false); }
  finally { await service.close(); }
});

test('future calendar validation rejects invalid dates, offsets, clocks and private note payloads are unused', () => {
  for (const eventAt of ['2026-11-31T10:00:00Z', '2026-11-04T24:00:00Z', '2026-11-04T10:60:00Z', '2026-11-04T10:00:00+24:00', '2026-11-04T10:00:00']) assert.throws(() => validateReminder(reminder({ eventAt }), initialNow));
  for (const change of [{ eventAt: new Date(initialNow).toISOString() }, { petId: '../owner' }, { petName: 'line\nbreak' }, { leadMinutes: 1 }, { timeZone: 'Invalid/Zone' }]) assert.throws(() => validateReminder(reminder(change), initialNow));
  const result = validateReminder(reminder({ notes: 'Private note must not enter the queue' }), initialNow); assert.equal('notes' in result, false);
});

test('owner/type isolation, idempotency and explicit queued cancellation', async () => {
  const { service } = fixture();
  try {
    pair(service); await assert.rejects(service.schedule('owner-b', reminder()), error => error.code === 'opt_in_required');
    await assert.rejects(service.schedule('owner-a', reminder({ kind: 'walk' })), error => error.code === 'opt_in_required');
    const first = await service.schedule('owner-a', reminder()); const second = await service.schedule('owner-a', reminder());
    assert.equal(first.scheduled, true); assert.equal(second.reused, true); assert.equal(first.reminder.id, second.reminder.id);
    assert.throws(() => service.cancel('owner-b', { id: first.reminder.id }), error => error.status === 404);
    assert.equal(service.cancel('owner-a', { id: first.reminder.id }).reminder.state, 'cancelled');
    assert.deepEqual(service.status('owner-b').reminders, []);
  } finally { await service.close(); }
});

test('capacity also applies when restoring a cancelled existing row', async () => {
  const { service } = fixture();
  try {
    pair(service); const old = await service.schedule('owner-a', reminder()); service.cancel('owner-a', { id: old.reminder.id });
    for (let n = 0; n < 50; n++) await service.schedule('owner-a', reminder({ clientReminderId: 'active-' + n }));
    await assert.rejects(service.schedule('owner-a', reminder({ eventAt: new Date(initialNow + 180_000).toISOString() })), error => error.code === 'reminder_limit');
  } finally { await service.close(); }
});

test('a repeated fifteen-minute reminder preserves its original due time after the lead passes', async () => {
  const { service, setNow } = fixture();
  try {
    pair(service); const input = reminder({ leadMinutes: 15, eventAt: new Date(initialNow + 1_200_000).toISOString() });
    const first = await service.schedule('owner-a', input); setNow(initialNow + 600_000);
    const replay = await service.schedule('owner-a', input);
    assert.equal(replay.reused, true); assert.equal(replay.reminder.scheduledFor, first.reminder.scheduledFor);
  } finally { await service.close(); }
});

test('STOP revokes scope, erases the recipient, cancels queued jobs and prevents a send', async () => {
  let posts = 0; const { service, setNow } = fixture(async (_url, options) => { if (options.method === 'GET') return approved(); posts++; return Response.json({}); });
  try {
    pair(service); await service.schedule('owner-a', reminder()); deliver(service, inbound('STOP'));
    const result = service.status('owner-a'); assert.equal(result.connected, false); assert.equal(result.recipientLabel, null); assert.equal(result.reminders[0].state, 'cancelled');
    assert.deepEqual(result.preferences, { appointmentAlerts: false, walkAlerts: false }); setNow(initialNow + 120_001); await service.drainDue(); assert.equal(posts, 0);
  } finally { await service.close(); }
});

test('only the exact approved utility reminder body can be queued', async () => {
  for (const bad of [{ status: 'PENDING' }, { category: 'MARKETING' }, { language: 'fr' }, { components: [{ type: 'BODY', text: 'Order {{1}} {{2}} {{3}}' }] }, { components: [{ type: 'BODY', text: WHATSAPP_TEMPLATE_BODY }, { type: 'FOOTER', text: 'Other content' }] }]) {
    const { service } = fixture(async () => Response.json({ data: [template(bad)] }));
    try { pair(service); await assert.rejects(service.schedule('owner-a', reminder()), error => error.code === 'template_not_approved'); assert.equal(service.status('owner-a').reminders.length, 0); }
    finally { await service.close(); }
  }
});

test('queue survives restart and accepted/delivered/read status is distinct and monotonic', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'meta-whatsapp-fixture-')); const dbPath = join(temporary, 'queue.sqlite'); let posts = [];
  let first = fixture(undefined, { databasePath: dbPath });
  try {
    pair(first.service); await first.service.schedule('owner-a', reminder()); await first.service.close();
    for (const path of [dbPath, dbPath + '-wal']) if (existsSync(path)) assert.equal(readFileSync(path).includes(Buffer.from(number)), false);
    first = fixture(async (url, options) => { assert.match(url, /^https:\/\/graph\.facebook\.com\/v25\.0\//); if (options.method === 'GET') return approved(); posts.push(JSON.parse(options.body)); return Response.json({ messages: [{ id: 'wamid.fixture-accepted' }] }); }, { databasePath: dbPath });
    assert.equal(first.service.status('owner-a').connected, true); first.setNow(initialNow + 120_001); await first.service.drainDue();
    assert.equal(posts.length, 1); const payload = posts[0]; assert.equal(payload.type, 'template'); assert.equal(payload.to, number);
    assert.deepEqual(payload.template.components[0].parameters.slice(0, 2), [{ type: 'text', text: 'Fixture pet' }, { type: 'text', text: 'appointment' }]);
    assert.match(payload.template.components[0].parameters[2].text, /Africa\/Johannesburg/); assert.equal(first.service.status('owner-a').reminders[0].state, 'accepted');
    deliver(first.service, statusEvent('delivered', initialNow + 120_000)); assert.equal(first.service.status('owner-a').reminders[0].state, 'delivered');
    deliver(first.service, statusEvent('sent', initialNow + 120_000)); assert.equal(first.service.status('owner-a').reminders[0].state, 'delivered');
    deliver(first.service, statusEvent('read', initialNow + 121_000)); assert.equal(first.service.status('owner-a').reminders[0].state, 'read');
  } finally { await first.service.close(); const checked = resolve(temporary); assert.ok(checked.startsWith(resolve(tmpdir()) + sep) && basename(checked).startsWith('meta-whatsapp-fixture-')); rmSync(checked, { recursive: true, force: true }); }
});

test('ambiguous outbound connection loss is never retried automatically', async () => {
  let posts = 0; const { service, setNow } = fixture(async (_url, options) => { if (options.method === 'GET') return approved(); posts++; throw new Error('fixture connection loss'); });
  try { pair(service); await service.schedule('owner-a', reminder()); setNow(initialNow + 120_001); await service.drainDue(); assert.equal(service.status('owner-a').reminders[0].state, 'delivery_unknown'); await service.drainDue(); assert.equal(posts, 1); }
  finally { await service.close(); }
});

test('known provider rate-limit rejection retries only within the bounded attempt budget', async () => {
  let posts = 0; const { service, setNow } = fixture(async (_url, options) => { if (options.method === 'GET') return approved(); posts++; return new Response('', { status: 429 }); });
  try {
    pair(service); await service.schedule('owner-a', reminder());
    for (const delta of [120_001, 151_001, 212_001, 333_001]) { setNow(initialNow + delta); await service.drainDue(); }
    assert.equal(posts, 3); assert.equal(service.status('owner-a').reminders[0].state, 'failed');
  } finally { await service.close(); }
});

test('interrupted claimed jobs become unknown without blind replay', async () => {
  let posts = 0; const { service, store, setNow } = fixture(async (_url, options) => { if (options.method === 'GET') return approved(); posts++; return Response.json({}); });
  try { pair(service); await service.schedule('owner-a', reminder()); store.claimDue(initialNow + 120_001); setNow(initialNow + 181_001); await service.drainDue(); assert.equal(posts, 0); assert.equal(service.status('owner-a').reminders[0].state, 'delivery_unknown'); }
  finally { await service.close(); }
});

test('disconnect during awaited template preflight prevents the actual POST', async () => {
  let gets = 0; let posts = 0; let enter; let release; const entered = new Promise(r => { enter = r; }); const deferred = new Promise(r => { release = r; });
  const { service, setNow } = fixture(async (_url, options) => { if (options.method === 'GET') { if (++gets > 1) { enter(); await deferred; } return approved(); } posts++; return Response.json({ messages: [{ id: 'wamid.fixture' }] }); });
  try { pair(service); await service.schedule('owner-a', reminder()); setNow(initialNow + 120_001); const draining = service.drainDue(); await entered; service.disconnect('owner-a'); release(); await draining; assert.equal(posts, 0); assert.equal(service.status('owner-a').reminders[0].state, 'cancelled'); }
  finally { release(); await service.close(); }
});

test('late jobs expire instead of sending stale reminders', async () => {
  let posts = 0; const { service, setNow } = fixture(async (_url, options) => { if (options.method === 'GET') return approved(); posts++; return Response.json({}); });
  try { pair(service); await service.schedule('owner-a', reminder()); setNow(initialNow + 600_000); await service.drainDue(); assert.equal(posts, 0); assert.equal(service.status('owner-a').reminders[0].state, 'expired'); }
  finally { await service.close(); }
});

test('disabled outbound still permits existing-owner status, cancellation, disconnect and signed STOP', async () => {
  const { service, store } = fixture(); let disabled;
  try {
    pair(service); const first = await service.schedule('owner-a', reminder());
    disabled = createWhatsAppService({ env: { ...env, WHATSAPP_ENABLED: 'false', WHATSAPP_ACCESS_TOKEN: '' }, store, fetchImpl: async () => { throw new Error('disabled must not fetch'); }, now: () => initialNow });
    const status = disabled.status('owner-a'); assert.equal(status.available, false); assert.equal(status.connected, true); assert.equal(status.reminders.length, 1);
    assert.equal(disabled.cancel('owner-a', { id: first.reminder.id }).reminder.state, 'cancelled');
    assert.throws(() => disabled.pair('owner-a', { consent: true, appointmentAlerts: true, walkAlerts: false }), error => error.status === 503);
    await assert.rejects(disabled.schedule('owner-a', reminder()), error => error.status === 503);
    deliver(disabled, inbound('STOP')); assert.equal(disabled.status('owner-a').connected, false); assert.equal(disabled.disconnect('owner-a').connected, false);
    assert.deepEqual(await disabled.drainDue(), { accepted: 0 });
  } finally { if (disabled) await disabled.close(); else await service.close(); }
});

test('HTTP routes require bound Facebook session, preserve raw webhook bytes and return unquoted challenge', async () => {
  const { service } = fixture(); const authService = { webOrigins: [], async close() {}, async getConfig() { return { available: true }; }, async getSession(headers) { return headers.cookie === 'fixture=owner-a' ? { session: { id: 'fixture-session' }, user: { id: 'owner-a' } } : null; } };
  const server = createMuseServer({ env: {}, authService, whatsappService: service }); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const base = 'http://127.0.0.1:' + server.address().port;
  const protectedHeaders = { cookie: 'fixture=owner-a', 'x-muse-owner': 'owner-a' };
  try {
    const publicConfig = await fetch(base + '/api/whatsapp/config'); assert.equal(publicConfig.status, 200); assert.equal(publicConfig.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(base + '/api/whatsapp/status')).status, 401);
    assert.equal((await fetch(base + '/api/whatsapp/status', { headers: { authorization: 'Bearer arbitrary', 'x-muse-owner': 'owner-a' } })).status, 401);
    assert.equal((await fetch(base + '/api/whatsapp/status', { headers: { cookie: 'fixture=owner-a', 'x-muse-owner': 'owner-b' } })).status, 401);
    assert.equal((await fetch(base + '/api/whatsapp/status', { headers: protectedHeaders })).status, 200);
    const query = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': env.WHATSAPP_WEBHOOK_VERIFY_TOKEN, 'hub.challenge': '123456789' });
    const challenge = await fetch(base + '/api/whatsapp/webhook?' + query); assert.equal(await challenge.text(), '123456789'); assert.match(challenge.headers.get('content-type'), /^text\/plain/);
    query.set('hub.verify_token', 'wrong'); assert.equal((await fetch(base + '/api/whatsapp/webhook?' + query)).status, 403);
    const request = service.pair('owner-a', { consent: true, appointmentAlerts: true, walkAlerts: false }); const payload = signed(inbound(new URL(request.pairing.link).searchParams.get('text')));
    const h = { 'content-type': 'application/json', 'x-hub-signature-256': payload.signature };
    assert.equal((await fetch(base + '/api/whatsapp/webhook', { method: 'POST', headers: h, body: Buffer.concat([payload.raw, Buffer.from(' ')]) })).status, 403);
    assert.equal((await fetch(base + '/api/whatsapp/webhook', { method: 'POST', headers: h, body: payload.raw })).status, 200); assert.equal(service.status('owner-a').connected, true);
    const badOrigin = await fetch(base + '/api/whatsapp/status', { headers: { ...protectedHeaders, origin: 'https://untrusted.invalid' } }); assert.equal(badOrigin.status, 403);
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});
