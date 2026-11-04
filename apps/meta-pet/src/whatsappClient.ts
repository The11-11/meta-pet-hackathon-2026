import type { MuseTransport } from './types';

export type WhatsAppConfig = {
  enabled: boolean; configured: boolean; available: boolean;
  status: 'disabled' | 'setup_required' | 'configured'; message: string;
};
export type WhatsAppPreferences = { appointmentAlerts: boolean; walkAlerts: boolean };
export type WhatsAppReminderState = 'scheduled' | 'sending' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'delivery_unknown' | 'cancelled' | 'expired';
export type WhatsAppReminder = {
  id: string; petId: string; clientReminderId: string; kind: 'appointment' | 'walk';
  eventAt: string; scheduledFor: string; state: WhatsAppReminderState; errorCode: string | null;
};
export type WhatsAppStatus = WhatsAppConfig & {
  connected: boolean; recipientLabel: string | null; preferences: WhatsAppPreferences;
  pendingPairing: { expiresAt: string } | null; reminders: WhatsAppReminder[];
};
export type WhatsAppPairing = { link: string; expiresAt: string };
export type WhatsAppSession = { ownerId: string; transport: MuseTransport };
export type WhatsAppScheduleInput = {
  petId: string; clientReminderId: string; petName: string; kind: 'appointment' | 'walk';
  eventAt: string; leadMinutes: 0 | 15; timeZone: 'Africa/Johannesburg';
};
const states: WhatsAppReminderState[] = ['scheduled', 'sending', 'accepted', 'sent', 'delivered', 'read', 'failed', 'delivery_unknown', 'cancelled', 'expired'];
const identifier = /^[A-Za-z0-9_-]{1,100}$/;
const invalid = () => new Error('WhatsApp returned an unexpected response. Refresh before trying again.');
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
};
const isoDate = (value: unknown): value is string => typeof value === 'string' && value.length <= 40
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

export function parseWhatsAppConfig(value: unknown): WhatsAppConfig {
  const item = record(value);
  if (typeof item.enabled !== 'boolean' || typeof item.configured !== 'boolean' || typeof item.available !== 'boolean'
    || !['disabled', 'setup_required', 'configured'].includes(item.status as string)
    || typeof item.message !== 'string' || item.message.length > 500) throw invalid();
  if (item.available !== (item.enabled && item.configured)) throw invalid();
  return { enabled: item.enabled, configured: item.configured, available: item.available, status: item.status as WhatsAppConfig['status'], message: item.message };
}

export function parseWhatsAppReminder(value: unknown): WhatsAppReminder {
  const item = record(value);
  if (typeof item.id !== 'string' || !/^[a-f0-9]{64}$/i.test(item.id)
    || typeof item.petId !== 'string' || !identifier.test(item.petId)
    || typeof item.clientReminderId !== 'string' || !identifier.test(item.clientReminderId)
    || !['appointment', 'walk'].includes(item.kind as string) || !isoDate(item.eventAt) || !isoDate(item.scheduledFor)
    || !states.includes(item.state as WhatsAppReminderState)
    || !(item.errorCode === null || (typeof item.errorCode === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(item.errorCode)))) throw invalid();
  return { id: item.id, petId: item.petId, clientReminderId: item.clientReminderId, kind: item.kind as WhatsAppReminder['kind'], eventAt: item.eventAt,
    scheduledFor: item.scheduledFor, state: item.state as WhatsAppReminderState, errorCode: item.errorCode as string | null };
}

export function parseWhatsAppStatus(value: unknown): WhatsAppStatus {
  const item = record(value); const config = parseWhatsAppConfig(item); const preferences = record(item.preferences);
  if (typeof item.connected !== 'boolean' || !(item.recipientLabel === null || (typeof item.recipientLabel === 'string' && /^•{4}\d{4}$/.test(item.recipientLabel)))
    || typeof preferences.appointmentAlerts !== 'boolean' || typeof preferences.walkAlerts !== 'boolean'
    || !Array.isArray(item.reminders) || item.reminders.length > 50) throw invalid();
  let pendingPairing = null;
  if (item.pendingPairing !== null) {
    const pending = record(item.pendingPairing);
    if (!isoDate(pending.expiresAt)) throw invalid();
    pendingPairing = { expiresAt: pending.expiresAt };
  }
  if (item.connected && (!item.recipientLabel || (!preferences.appointmentAlerts && !preferences.walkAlerts))) throw invalid();
  return { ...config, connected: item.connected, recipientLabel: item.recipientLabel as string | null,
    preferences: { appointmentAlerts: preferences.appointmentAlerts, walkAlerts: preferences.walkAlerts }, pendingPairing,
    reminders: item.reminders.map(parseWhatsAppReminder) };
}

// A one-use pairing URL is the only permitted external destination. Never accept an arbitrary phone or URL from a field.
export function validatedWhatsAppPairingLink(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200) throw invalid();
  let url: URL; try { url = new URL(value); } catch { throw invalid(); }
  if (url.protocol !== 'https:' || url.hostname !== 'wa.me' || url.username || url.password || url.port || url.hash
    || !/^\/[1-9]\d{6,14}$/.test(url.pathname) || [...url.searchParams.keys()].length !== 1
    || !/^START [A-F0-9]{32}$/.test(url.searchParams.get('text') ?? '')) throw invalid();
  return url.toString();
}

export function parseWhatsAppPairing(value: unknown, now = Date.now()): WhatsAppPairing {
  const item = record(value); const pairing = record(item.pairing);
  if (item.connected !== false || item.consentVersion !== 'pet-alerts-v1' || !isoDate(pairing.expiresAt)
    || Date.parse(pairing.expiresAt) <= now || Date.parse(pairing.expiresAt) > now + 11 * 60_000) throw invalid();
  return { link: validatedWhatsAppPairingLink(pairing.link), expiresAt: pairing.expiresAt };
}

function endpoint(baseUrl: string, path: string): string {
  let url: URL; try { url = new URL(baseUrl); } catch { throw new Error('The WhatsApp server address is unavailable.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('WhatsApp needs a secure server address.');
  return `${baseUrl.replace(/\/+$/, '')}/api/whatsapp/${path}`;
}

function sessionHeaders(session: WhatsAppSession): Record<string, string> {
  const headers = session.transport.headers ?? {};
  const owner = Object.entries(headers).find(([key]) => key.toLowerCase() === 'x-muse-owner')?.[1];
  const cookie = Object.entries(headers).find(([key]) => key.toLowerCase() === 'cookie')?.[1];
  if (!session.ownerId || owner !== session.ownerId || (session.transport.credentials !== 'include' && !cookie)) {
    throw new Error('Sign in with Facebook again to manage WhatsApp alerts.');
  }
  return { 'X-Muse-Owner': owner, ...(cookie ? { Cookie: cookie } : {}) };
}

async function request(baseUrl: string, path: string, signal: AbortSignal, session?: WhatsAppSession, body?: unknown): Promise<unknown> {
  if (signal.aborted) throw new Error('WhatsApp request was cancelled.');
  if (path !== 'config' && !session) throw new Error('Sign in with Facebook again to manage WhatsApp alerts.');
  const headers = session ? sessionHeaders(session) : {};
  const response = await fetch(endpoint(baseUrl, path), {
    method: body === undefined ? 'GET' : 'POST', credentials: session?.transport.credentials ?? 'omit',
    headers: { Accept: 'application/json', ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    signal, redirect: 'error', ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (signal.aborted) throw new Error('WhatsApp request was cancelled.');
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Sign in with Facebook again to manage WhatsApp alerts.');
    if (response.status === 503) throw new Error('WhatsApp setup is not ready. No new alert was scheduled.');
    if (response.status === 409) throw new Error('The WhatsApp connection or reminder changed. Refresh its status before trying again.');
    throw new Error('WhatsApp could not complete this request. Refresh its status before trying again.');
  }
  const data: unknown = await response.json();
  if (signal.aborted) throw new Error('WhatsApp request was cancelled.');
  return data;
}

export async function getWhatsAppConfig(baseUrl: string, signal: AbortSignal) {
  return parseWhatsAppConfig(await request(baseUrl, 'config', signal));
}
export async function getWhatsAppStatus(baseUrl: string, session: WhatsAppSession, signal: AbortSignal) {
  return parseWhatsAppStatus(await request(baseUrl, 'status', signal, session));
}
export async function pairWhatsApp(baseUrl: string, session: WhatsAppSession, preferences: WhatsAppPreferences, signal: AbortSignal) {
  if (typeof preferences.appointmentAlerts !== 'boolean' || typeof preferences.walkAlerts !== 'boolean' || (!preferences.appointmentAlerts && !preferences.walkAlerts)) throw new Error('Choose at least one alert type.');
  return parseWhatsAppPairing(await request(baseUrl, 'pair', signal, session, { consent: true, ...preferences }));
}
export async function scheduleWhatsAppReminder(baseUrl: string, session: WhatsAppSession, input: WhatsAppScheduleInput, signal: AbortSignal) {
  if (!identifier.test(input.petId) || !identifier.test(input.clientReminderId) || !input.petName.trim() || input.petName.length > 80 || /[\u0000-\u001f\u007f]/.test(input.petName)
    || !['appointment', 'walk'].includes(input.kind) || !isoDate(input.eventAt) || Date.parse(input.eventAt) <= Date.now()
    || ![0, 15].includes(input.leadMinutes) || input.timeZone !== 'Africa/Johannesburg') throw new Error('Choose a valid future care time before scheduling an alert.');
  const result = record(await request(baseUrl, 'reminders', signal, session, input));
  if (typeof result.scheduled !== 'boolean' || typeof result.reused !== 'boolean') throw invalid();
  const reminder = parseWhatsAppReminder(result.reminder);
  if (reminder.petId !== input.petId || reminder.clientReminderId !== input.clientReminderId || reminder.kind !== input.kind
    || Date.parse(reminder.eventAt) !== Date.parse(input.eventAt)) throw invalid();
  return { scheduled: result.scheduled, reused: result.reused, reminder };
}
export async function cancelWhatsAppReminder(baseUrl: string, session: WhatsAppSession, id: string, signal: AbortSignal) {
  if (!/^[a-f0-9]{64}$/i.test(id)) throw new Error('Choose a saved WhatsApp reminder.');
  return parseWhatsAppReminder(record(await request(baseUrl, 'reminders/cancel', signal, session, { id })).reminder);
}
export async function disconnectWhatsApp(baseUrl: string, session: WhatsAppSession, signal: AbortSignal) {
  const result = record(await request(baseUrl, 'disconnect', signal, session, {}));
  if (result.connected !== false || !Number.isSafeInteger(result.cancelledQueued) || (result.cancelledQueued as number) < 0) throw invalid();
  return { connected: false as const, cancelledQueued: result.cancelledQueued as number };
}

// An opaque idempotency key; this is not a security token and contains no appointment title or note.
export function whatsAppReminderKey(kind: 'appointment' | 'walk', parts: string[]): string {
  const value = JSON.stringify(parts); let first = 0x811c9dc5; let second = 0x9e3779b9;
  for (let i = 0; i < value.length; i++) { first = Math.imul(first ^ value.charCodeAt(i), 0x01000193); second = Math.imul(second ^ value.charCodeAt(i), 0x85ebca6b); }
  return `${kind}-${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

export function futureSastWalkTime(value: string, now = Date.now()): string | null {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value.trim())) return null;
  const iso = `${value.trim().replace(' ', 'T')}:00+02:00`;
  const instant = Date.parse(iso); if (!Number.isFinite(instant) || instant <= now) return null;
  // Date.parse accepts some impossible calendar dates; round-trip the fixed SAST offset.
  if (new Date(instant + 2 * 60 * 60_000).toISOString().slice(0, 16) !== value.trim().replace(' ', 'T')) return null;
  return iso;
}

export const whatsAppReminderLabels: Record<WhatsAppReminderState, string> = {
  scheduled: 'Queued for sending', sending: 'Sending — delivery not confirmed', accepted: 'Accepted by WhatsApp — delivery not confirmed',
  sent: 'Sent — delivery not confirmed', delivered: 'Delivered', read: 'Read', failed: 'Failed — no delivery confirmed',
  delivery_unknown: 'Delivery unknown — refresh before retrying', cancelled: 'Cancelled', expired: 'Expired — not sent',
};
