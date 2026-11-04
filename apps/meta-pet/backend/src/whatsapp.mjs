import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createWhatsAppStore } from './whatsapp-store.mjs';
import { WHATSAPP_CONSENT_VERSION, WhatsAppError, createWhatsAppProvider, publicWhatsAppConfiguration,
  readWhatsAppConfiguration, requireWhatsApp, validateOwner, validateReminder, verifyWhatsAppSignature } from './whatsapp-core.mjs';
export { WhatsAppError, readWhatsAppConfiguration } from './whatsapp-core.mjs';

const eventKey = values => createHash('sha256').update(JSON.stringify(values)).digest('hex');
const providerId = value => typeof value === 'string' && /^[A-Za-z0-9._:/+=-]{1,256}$/.test(value);
const recipient = value => typeof value === 'string' && /^[1-9]\d{6,14}$/.test(value);
const emptyStatus = () => ({ connected: false, recipientLabel: null, preferences: { appointmentAlerts: false, walkAlerts: false }, pendingPairing: null, reminders: [] });
function equal(expected, actual) {
  if (typeof actual !== 'string') return false;
  const a = Buffer.from(expected), b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createWhatsAppService({ env = process.env, fetchImpl = fetch, now = Date.now, store: suppliedStore, provider: suppliedProvider } = {}) {
  const config = readWhatsAppConfiguration(env);
  // Existing consent remains readable and revocable when outbound sending is off.
  // Disabled setup never creates a new database merely to report its status.
  const store = config.storageConfigured && (config.available || suppliedStore || existsSync(config.databasePath)) ? suppliedStore ?? createWhatsAppStore(config) : null;
  const provider = config.available ? suppliedProvider ?? createWhatsAppProvider(config, { fetchImpl, now }) : null;
  let timer; let pendingTick; let stopped = false; let lastWorkerError = null;
  const readiness = () => publicWhatsAppConfiguration(config);
  const requireStore = () => { if (!store) throw new WhatsAppError(503, 'whatsapp_store_unavailable', 'WhatsApp alert records are unavailable. Restore the private alert store before changing saved alerts.'); };
  const requireWebhook = () => { requireStore(); if (!config.webhookConfigured) throw new WhatsAppError(503, 'whatsapp_unavailable', 'WhatsApp webhook setup is incomplete.'); };
  const service = {
    getConfig: readiness,
    status(owner) {
      validateOwner(owner);
      return { ...readiness(), ...(store ? store.status(owner, now()) : emptyStatus()), workerError: lastWorkerError };
    },
    pair(owner, body) {
      validateOwner(owner); requireWhatsApp(config);
      if (!body || body.consent !== true || typeof body.appointmentAlerts !== 'boolean' || typeof body.walkAlerts !== 'boolean' || (!body.appointmentAlerts && !body.walkAlerts)) throw new WhatsAppError(400, 'opt_in_required', 'Choose the alerts you want and explicitly agree to receive them on WhatsApp.');
      const pair = store.createPairing(owner, body, now());
      return { connected: false, pairing: { link: `https://wa.me/${config.sender}?text=${encodeURIComponent(`START ${pair.code}`)}`, expiresAt: new Date(pair.expiresAt).toISOString() }, consentVersion: WHATSAPP_CONSENT_VERSION };
    },
    disconnect(owner) {
      validateOwner(owner); requireStore();
      return { connected: false, cancelledQueued: store.disconnect(owner, now()) };
    },
    async schedule(owner, body) {
      validateOwner(owner); requireWhatsApp(config);
      const input = validateReminder(body, now());
      const status = store.status(owner, now());
      if (!status.connected || !(input.kind === 'walk' ? status.preferences.walkAlerts : status.preferences.appointmentAlerts)) throw new WhatsAppError(409, 'opt_in_required', 'Connect and opt in to this type of WhatsApp alert first.');
      await provider.verifyTemplate();
      // The store rechecks the verified connection after the awaited preflight.
      return store.schedule(owner, input, now());
    },
    cancel(owner, body) {
      validateOwner(owner); requireStore();
      if (!body || typeof body.id !== 'string' || !/^[a-f0-9]{64}$/.test(body.id)) throw new WhatsAppError(400, 'invalid_reminder', 'Choose a saved WhatsApp reminder.');
      return { reminder: store.cancel(owner, body.id, now()) };
    },
    verifyWebhook(query) {
      requireWebhook();
      const challenge = query.get('hub.challenge');
      if (query.get('hub.mode') !== 'subscribe' || !equal(config.verifyToken, query.get('hub.verify_token')) || typeof challenge !== 'string' || !challenge || challenge.length > 2048) throw new WhatsAppError(403, 'webhook_verification_failed', 'Webhook verification failed.');
      return challenge;
    },
    webhook(raw, signature) {
      requireWebhook();
      if (!Buffer.isBuffer(raw) || raw.length > 256 * 1024) throw new WhatsAppError(413, 'webhook_too_large', 'The webhook is too large.');
      if (!verifyWhatsAppSignature(raw, signature, config.appSecret)) throw new WhatsAppError(403, 'webhook_signature_invalid', 'Webhook signature verification failed.');
      let body;
      try { body = JSON.parse(raw.toString('utf8')); } catch { throw new WhatsAppError(400, 'webhook_invalid', 'The webhook is not valid JSON.'); }
      if (body?.object !== 'whatsapp_business_account') return { handled: true };
      if (!Array.isArray(body.entry) || body.entry.length > 50) throw new WhatsAppError(400, 'webhook_invalid', 'The webhook batch is invalid.');
      for (const entry of body.entry) {
        if (entry?.id !== config.wabaId || !Array.isArray(entry.changes)) continue;
        if (entry.changes.length > 100) throw new WhatsAppError(400, 'webhook_invalid', 'The webhook batch is invalid.');
        for (const change of entry.changes) {
          const value = change?.value;
          if (change?.field !== 'messages' || value?.metadata?.phone_number_id !== config.phoneId || value?.messaging_product !== 'whatsapp') continue;
          if ((Array.isArray(value.messages) && value.messages.length > 100) || (Array.isArray(value.statuses) && value.statuses.length > 100)) throw new WhatsAppError(400, 'webhook_invalid', 'The webhook batch is invalid.');
          for (const message of Array.isArray(value.messages) ? value.messages : []) {
            if (!providerId(message?.id) || !recipient(message?.from) || message?.type !== 'text' || typeof message?.text?.body !== 'string' || message.text.body.length > 200) continue;
            const text = message.text.body.trim(); const key = eventKey(['message', config.wabaId, config.phoneId, message.id]);
            const pair = /^START\s+([A-Fa-f0-9]{32})$/.exec(text);
            if (pair && config.available) store.completePairing(pair[1], message.from, key, now());
            else if (/^(?:STOP|UNSUBSCRIBE|CANCEL|END|QUIT)$/i.test(text)) store.stopRecipient(message.from, key, now());
          }
          for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
            if (!providerId(status?.id) || !recipient(status?.recipient_id) || !['sent', 'delivered', 'read', 'failed'].includes(status?.status)) continue;
            const timestamp = Number(status.timestamp) * 1000;
            if (!Number.isSafeInteger(timestamp) || timestamp <= now() - 14 * 86_400_000 || timestamp > now() + 5 * 60_000) continue;
            store.recordStatus(status.id, status.recipient_id, status.status, timestamp, eventKey(['status', config.wabaId, config.phoneId, status.id, status.status, timestamp]), now());
          }
        }
      }
      return { handled: true };
    },
    async drainDue() {
      if (!config.available || stopped) return { accepted: 0 };
      if (pendingTick) return pendingTick;
      pendingTick = (async () => {
        let accepted = 0;
        for (let count = 0; count < 5 && !stopped; count++) {
          const job = store.claimDue(now()); if (!job) break;
          try {
            const id = await provider.sendReminder(job, () => store.dispatchRecipient(job, now()));
            store.accepted(job, id, now()); accepted++;
          } catch (error) {
            const safe = error instanceof WhatsAppError ? error : new WhatsAppError(503, 'worker_send_unconfirmed', 'WhatsApp could not confirm delivery.', { ambiguous: true });
            store.failed(job, safe, now());
          }
        }
        lastWorkerError = null; return { accepted };
      })().catch(() => { lastWorkerError = 'worker_unavailable'; return { accepted: 0 }; }).finally(() => { pendingTick = null; });
      return pendingTick;
    },
    start() {
      if (!config.available || stopped || timer) return;
      timer = setInterval(() => { void service.drainDue(); }, 30_000); timer.unref?.();
      void service.drainDue();
    },
    async close() {
      stopped = true; if (timer) clearInterval(timer);
      if (pendingTick) await pendingTick;
      store?.close();
    },
  };
  return service;
}
