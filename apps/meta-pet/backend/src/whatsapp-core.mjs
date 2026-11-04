import { createHmac, timingSafeEqual } from 'node:crypto';
import { isAbsolute, parse, resolve } from 'node:path';

export const WHATSAPP_CONSENT_VERSION = 'pet-alerts-v1';
export const WHATSAPP_TEMPLATE_BODY = 'Meta Pet reminder for {{1}}: your requested {{2}} is planned for {{3}}. Open Meta Pet for details. Reply STOP to stop.';
export class WhatsAppError extends Error {
  constructor(status, code, message, options = {}) {
    super(message); this.status = status; this.code = code;
    this.retryable = options.retryable === true; this.ambiguous = options.ambiguous === true;
    this.retryAfterMs = options.retryAfterMs ?? 30_000;
  }
}
export function readWhatsAppConfiguration(env = process.env) {
  const value = key => typeof env[key] === 'string' ? env[key].trim() : '';
  const enabled = value('WHATSAPP_ENABLED') === 'true';
  const config = {
    enabled, wabaId: value('WHATSAPP_BUSINESS_ACCOUNT_ID'), phoneId: value('WHATSAPP_PHONE_NUMBER_ID'),
    sender: value('WHATSAPP_SENDER_NUMBER').replace(/^\+/, ''), accessToken: value('WHATSAPP_ACCESS_TOKEN'),
    appSecret: value('WHATSAPP_APP_SECRET'), verifyToken: value('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
    graphVersion: value('WHATSAPP_GRAPH_VERSION'), templateName: value('WHATSAPP_TEMPLATE_NAME'),
    templateLanguage: value('WHATSAPP_TEMPLATE_LANGUAGE'), databasePath: value('WHATSAPP_DATABASE_PATH'),
    encryptionKey: value('WHATSAPP_DATA_ENCRYPTION_KEY'),
  };
  const path = config.databasePath;
  const safePath = path && isAbsolute(path) && resolve(path) !== parse(resolve(path)).root && !path.includes('\0');
  config.storageConfigured = Boolean(safePath && /^[a-fA-F0-9]{64}$/.test(config.encryptionKey));
  config.webhookConfigured = Boolean(/^\d{5,30}$/.test(config.wabaId) && /^\d{5,30}$/.test(config.phoneId)
    && config.appSecret.length >= 16 && config.appSecret.length <= 256 && /^[A-Za-z0-9_-]{32,256}$/.test(config.verifyToken)
    && ![config.appSecret, config.verifyToken].some(item => /^(?:your[-_ ]|example|placeholder|change[-_ ]?me)/i.test(item)));
  config.configured = Boolean(/^\d{5,30}$/.test(config.wabaId) && /^\d{5,30}$/.test(config.phoneId)
    && /^[1-9]\d{6,14}$/.test(config.sender) && config.accessToken.length >= 20 && config.accessToken.length <= 4096
    && config.appSecret.length >= 16 && config.appSecret.length <= 256
    && /^[A-Za-z0-9_-]{32,256}$/.test(config.verifyToken) && /^v\d{1,2}\.\d{1,2}$/.test(config.graphVersion)
    && /^[a-z][a-z0-9_]{0,79}$/.test(config.templateName) && /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(config.templateLanguage)
    && config.storageConfigured
    && ![config.accessToken, config.appSecret, config.verifyToken].some(item => /^(?:your[-_ ]|example|placeholder|change[-_ ]?me)/i.test(item)));
  config.available = enabled && config.configured;
  return config;
}
export function publicWhatsAppConfiguration(config) {
  const status = !config.enabled ? 'disabled' : !config.configured ? 'setup_required' : 'configured';
  return { enabled: config.enabled, configured: config.configured, available: config.available, status,
    message: status === 'disabled' ? 'WhatsApp is not linked yet. Phone alerts remain separate.'
      : status === 'setup_required' ? 'WhatsApp server setup is incomplete. No messages are being sent.'
        : 'WhatsApp server settings are present. Connect your own number and opt in before scheduling alerts.' };
}
export function requireWhatsApp(config) {
  if (!config.available) throw new WhatsAppError(503, 'whatsapp_unavailable', 'WhatsApp is not linked yet. Complete the server setup before connecting or scheduling alerts.');
}
export function verifyWhatsAppSignature(raw, signature, secret) {
  if (!Buffer.isBuffer(raw) || !secret || typeof signature !== 'string' || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) return false;
  const actual = Buffer.from(signature.slice(7), 'hex');
  const expected = createHmac('sha256', secret).update(raw).digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function validateOwner(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 256 || /[\x00-\x1f]/.test(value)) throw new WhatsAppError(401, 'owner_required', 'Sign in with Facebook to manage WhatsApp alerts.');
  return value;
}
function identifier(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new WhatsAppError(400, 'invalid_reminder', `Choose a valid ${label}.`);
  return value;
}
export function validateReminder(body, now) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new WhatsAppError(400, 'invalid_reminder', 'Choose a saved pet reminder first.');
  const petId = identifier(body.petId, 'pet page');
  const clientReminderId = identifier(body.clientReminderId, 'reminder');
  if (!['appointment', 'walk'].includes(body.kind) || ![0, 15].includes(body.leadMinutes)) throw new WhatsAppError(400, 'invalid_reminder', 'Choose an appointment or walk reminder and a supported reminder time.');
  if (typeof body.petName !== 'string' || !body.petName.trim() || body.petName.trim().length > 80 || /[\x00-\x1f\x7f]/.test(body.petName)) throw new WhatsAppError(400, 'invalid_reminder', 'Use a short pet name for the reminder.');
  if (typeof body.eventAt !== 'string' || body.eventAt.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(body.eventAt)) throw new WhatsAppError(400, 'invalid_reminder', 'Use a future date with its time-zone offset.');
  const eventAt = Date.parse(body.eventAt);
  const [year, month, day] = body.eventAt.slice(0, 10).split('-').map(Number);
  const clock = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-](\d{2}):(\d{2}))$/.exec(body.eventAt);
  if (Number(clock[1]) > 23 || Number(clock[2]) > 59 || Number(clock[3] ?? 0) > 59 || Number(clock[5] ?? 0) > 23 || Number(clock[6] ?? 0) > 59) throw new WhatsAppError(400, 'invalid_reminder', 'Choose a valid reminder time and offset.');
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) throw new WhatsAppError(400, 'invalid_reminder', 'Choose a valid calendar date.');
  if (!Number.isFinite(eventAt) || eventAt <= now + 5_000 || eventAt > now + 366 * 86_400_000) throw new WhatsAppError(400, 'invalid_reminder', 'Choose a future reminder within the next year.');
  if (typeof body.timeZone !== 'string' || body.timeZone.length > 80) throw new WhatsAppError(400, 'invalid_reminder', 'Choose a valid reminder time zone.');
  try { new Intl.DateTimeFormat('en', { timeZone: body.timeZone }).format(eventAt); }
  catch { throw new WhatsAppError(400, 'invalid_reminder', 'Choose a valid reminder time zone.'); }
  const early = eventAt - body.leadMinutes * 60_000;
  const dueAt = early > now + 5_000 ? early : eventAt;
  return { petId, clientReminderId, petName: body.petName.trim(), kind: body.kind, leadMinutes: body.leadMinutes, eventAt, dueAt,
    expiresAt: body.leadMinutes === 15 && dueAt < eventAt ? eventAt : eventAt + 5 * 60_000, timeZone: body.timeZone };
}

async function responseJson(response) {
  if (response.body?.getReader) {
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
        if (size > 128 * 1024) { await reader.cancel(); throw new Error('Response too large'); } chunks.push(Buffer.from(value)); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } finally { reader.releaseLock(); }
  }
  return response.json();
}
export function createWhatsAppProvider(config, { fetchImpl = fetch, now = Date.now } = {}) {
  let templateVerifiedAt = 0;
  const request = async (path, { method = 'GET', body } = {}) => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10_000); timer.unref?.();
    try {
      const response = await fetchImpl(`https://graph.facebook.com/${config.graphVersion}/${path}`, {
        method, signal: controller.signal, redirect: 'error', headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        const seconds = Number(response.headers?.get?.('retry-after'));
        if (response.status === 429) throw new WhatsAppError(503, 'provider_rate_limited', 'WhatsApp is temporarily rate limited.', { retryable: true, retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 3_600_000) : 30_000 });
        throw new WhatsAppError(503, response.status >= 500 ? 'provider_unavailable' : 'provider_rejected', 'WhatsApp could not accept this reminder.', { retryable: method === 'GET' && response.status >= 500, ambiguous: method === 'POST' && response.status >= 500 });
      }
      try { return await responseJson(response); }
      catch { throw new WhatsAppError(503, 'provider_response_invalid', 'WhatsApp did not confirm this request.', { retryable: method === 'GET', ambiguous: method === 'POST' }); }
    } catch (error) {
      if (error instanceof WhatsAppError) throw error;
      throw new WhatsAppError(503, 'provider_connection_failed', 'WhatsApp could not be reached.', { retryable: method === 'GET', ambiguous: method === 'POST' });
    } finally { clearTimeout(timer); }
  };
  const verifyTemplate = async () => {
    requireWhatsApp(config);
    if (templateVerifiedAt && now() - templateVerifiedAt < 60_000) return;
    const query = new URLSearchParams({ name: config.templateName, fields: 'name,language,status,category,components', limit: '100' });
    const result = await request(`${config.wabaId}/message_templates?${query}`);
    const approved = Array.isArray(result?.data) && result.data.some(item => item.name === config.templateName && item.language === config.templateLanguage && item.status === 'APPROVED' && item.category === 'UTILITY'
      && Array.isArray(item.components) && item.components.length === 1 && item.components[0].type === 'BODY' && item.components[0].text === WHATSAPP_TEMPLATE_BODY);
    if (!approved) throw new WhatsAppError(503, 'template_not_approved', 'An approved utility reminder template is required before scheduling WhatsApp alerts.');
    templateVerifiedAt = now();
  };
  return {
    verifyTemplate,
    async sendReminder(job, resolveRecipient) {
      await verifyTemplate();
      // Resolve consent and recipient only after all awaited readiness work.
      // A STOP or disconnect while Meta checks the template must prevent POST.
      const recipient = typeof resolveRecipient === 'function' ? resolveRecipient() : null;
      if (recipient === null) throw new WhatsAppError(409, 'opted_out', 'WhatsApp alerts were turned off before this reminder could send.');
      if (!/^[1-9]\d{6,14}$/.test(recipient)) throw new WhatsAppError(503, 'recipient_invalid', 'The verified WhatsApp recipient is unavailable.');
      const when = new Intl.DateTimeFormat('en-GB', { timeZone: job.time_zone, dateStyle: 'medium', timeStyle: 'short' }).format(job.event_at);
      const result = await request(`${config.phoneId}/messages`, { method: 'POST', body: {
        messaging_product: 'whatsapp', recipient_type: 'individual', to: recipient, type: 'template',
        template: { name: config.templateName, language: { code: config.templateLanguage }, components: [{ type: 'body', parameters: [
          { type: 'text', text: job.pet_name }, { type: 'text', text: job.kind === 'walk' ? 'walk' : 'appointment' }, { type: 'text', text: `${when} (${job.time_zone})` },
        ] }] },
      } });
      const id = result?.messages?.[0]?.id;
      if (typeof id !== 'string' || !/^[A-Za-z0-9._:/+=-]{1,256}$/.test(id)) throw new WhatsAppError(503, 'provider_unconfirmed', 'WhatsApp did not confirm message acceptance.', { ambiguous: true });
      return id;
    },
  };
}
