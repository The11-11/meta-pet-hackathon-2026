import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WhatsAppError, validateOwner } from './whatsapp-core.mjs';

const ACTIVE = "('scheduled','sending')";
const publicJob = row => row ? { id: row.id, petId: row.pet_id, clientReminderId: row.client_id, kind: row.kind,
  eventAt: new Date(row.event_at).toISOString(), scheduledFor: new Date(row.due_at).toISOString(), state: row.state, errorCode: row.error_code ?? null } : null;
export function createWhatsAppStore({ databasePath, encryptionKey }) {
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  const key = Buffer.from(encryptionKey, 'hex');
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS whatsapp_connections (
      owner_id TEXT PRIMARY KEY, recipient_hash TEXT UNIQUE, recipient_cipher TEXT, recipient_label TEXT,
      opted_in INTEGER NOT NULL DEFAULT 0, appointment_alerts INTEGER NOT NULL DEFAULT 0, walk_alerts INTEGER NOT NULL DEFAULT 0,
      consent_version INTEGER NOT NULL DEFAULT 0, consent_at INTEGER, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS whatsapp_pairings (
      code_hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL,
      appointment_alerts INTEGER NOT NULL, walk_alerts INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS whatsapp_pair_attempts (owner_id TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS whatsapp_pair_attempts_time ON whatsapp_pair_attempts(owner_id,created_at);
    CREATE TABLE IF NOT EXISTS whatsapp_jobs (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, pet_id TEXT NOT NULL, client_id TEXT NOT NULL,
      pet_name TEXT NOT NULL, kind TEXT NOT NULL, lead_minutes INTEGER NOT NULL DEFAULT 0, event_at INTEGER NOT NULL, due_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      time_zone TEXT NOT NULL, recipient_hash TEXT NOT NULL, consent_version INTEGER NOT NULL,
      state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL,
      lease_token TEXT, lease_until INTEGER, provider_id TEXT UNIQUE, error_code TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, attempted_at INTEGER,
      UNIQUE(owner_id,pet_id,client_id));
    CREATE INDEX IF NOT EXISTS whatsapp_jobs_due ON whatsapp_jobs(state,next_attempt_at,due_at);
    CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (event_key TEXT PRIMARY KEY, received_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS whatsapp_status_events (provider_id TEXT PRIMARY KEY, recipient_hash TEXT NOT NULL, status TEXT NOT NULL, status_at INTEGER NOT NULL);
  `);
  if (!db.prepare('PRAGMA table_info(whatsapp_jobs)').all().some(column => column.name === 'lead_minutes')) {
    db.exec('ALTER TABLE whatsapp_jobs ADD COLUMN lead_minutes INTEGER NOT NULL DEFAULT 0; UPDATE whatsapp_jobs SET lead_minutes=15 WHERE event_at-due_at=900000;');
  }
  const keyed = text => createHmac('sha256', key).update(text).digest('hex');
  const recipientHash = number => keyed('recipient:' + number);
  function encrypt(number) {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(number, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  }
  function decrypt(value) {
    const bytes = Buffer.from(value, 'base64'); const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
  }
  const transaction = work => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const connection = owner => db.prepare('SELECT * FROM whatsapp_connections WHERE owner_id=?').get(validateOwner(owner));
  const cancelQueued = (owner, now) => Number(db.prepare("UPDATE whatsapp_jobs SET state='cancelled',error_code='opted_out',updated_at=? WHERE owner_id=? AND state='scheduled'").run(now, owner).changes);
  const rememberEvent = (eventKey, now) => Number(db.prepare('INSERT OR IGNORE INTO whatsapp_webhook_events(event_key,received_at) VALUES(?,?)').run(eventKey, now).changes) === 1;
  const applyStatus = (job, status) => {
    if (!job || !status || job.recipient_hash !== status.recipient_hash || !['accepted', 'sent', 'delivered', 'read', 'failed'].includes(job.state)) return;
    const ranks = { accepted: 0, sent: 1, delivered: 2, read: 3 };
    if (status.status === 'failed' && ['delivered', 'read'].includes(job.state)) return;
    if (status.status !== 'failed' && job.state !== 'failed' && ranks[status.status] < ranks[job.state]) return;
    db.prepare('UPDATE whatsapp_jobs SET state=?,error_code=?,updated_at=? WHERE id=?').run(status.status, status.status === 'failed' ? 'delivery_failed' : null, status.status_at, job.id);
  };
  return {
    createPairing(owner, preferences, now) {
      validateOwner(owner);
      return transaction(() => {
        db.prepare('DELETE FROM whatsapp_pair_attempts WHERE created_at<?').run(now - 86_400_000);
        const attempts = db.prepare('SELECT count(*) AS n FROM whatsapp_pair_attempts WHERE owner_id=? AND created_at>?').get(owner, now - 600_000).n;
        if (attempts >= 5) throw new WhatsAppError(429, 'pairing_rate_limited', 'Too many connection attempts. Try again in ten minutes.');
        const code = randomBytes(16).toString('hex').toUpperCase(); const expiresAt = now + 10 * 60_000;
        db.prepare('INSERT INTO whatsapp_pair_attempts VALUES(?,?)').run(owner, now);
        db.prepare('DELETE FROM whatsapp_pairings WHERE owner_id=? OR expires_at<=?').run(owner, now);
        db.prepare('INSERT INTO whatsapp_pairings VALUES(?,?,?,?,?)').run(keyed('pair:' + code), owner, expiresAt, Number(preferences.appointmentAlerts), Number(preferences.walkAlerts));
        return { code, expiresAt };
      });
    },
    completePairing(code, recipient, eventKey, now) {
      return transaction(() => {
        if (!rememberEvent(eventKey, now)) return false;
        const pair = db.prepare('SELECT * FROM whatsapp_pairings WHERE code_hash=? AND expires_at>?').get(keyed('pair:' + code.toUpperCase()), now);
        if (!pair) return false;
        const hash = recipientHash(recipient);
        const other = db.prepare('SELECT owner_id FROM whatsapp_connections WHERE recipient_hash=? AND owner_id<>?').get(hash, pair.owner_id);
        if (other) return false;
        cancelQueued(pair.owner_id, now);
        db.prepare(`INSERT INTO whatsapp_connections VALUES(?,?,?,?,1,?,?,1,?,?)
          ON CONFLICT(owner_id) DO UPDATE SET recipient_hash=excluded.recipient_hash,recipient_cipher=excluded.recipient_cipher,
          recipient_label=excluded.recipient_label,opted_in=1,appointment_alerts=excluded.appointment_alerts,walk_alerts=excluded.walk_alerts,
          consent_version=whatsapp_connections.consent_version+1,consent_at=excluded.consent_at,updated_at=excluded.updated_at`)
          .run(pair.owner_id, hash, encrypt(recipient), '••••' + recipient.slice(-4), pair.appointment_alerts, pair.walk_alerts, now, now);
        db.prepare('DELETE FROM whatsapp_pairings WHERE owner_id=?').run(pair.owner_id);
        return true;
      });
    },
    disconnect(owner, now) {
      validateOwner(owner);
      return transaction(() => {
        db.prepare('DELETE FROM whatsapp_pairings WHERE owner_id=?').run(owner);
        db.prepare('UPDATE whatsapp_connections SET opted_in=0,recipient_hash=NULL,recipient_cipher=NULL,recipient_label=NULL,appointment_alerts=0,walk_alerts=0,consent_version=consent_version+1,updated_at=? WHERE owner_id=?').run(now, owner);
        return cancelQueued(owner, now);
      });
    },
    stopRecipient(recipient, eventKey, now) {
      return transaction(() => {
        if (!rememberEvent(eventKey, now)) return false;
        const match = db.prepare('SELECT owner_id FROM whatsapp_connections WHERE recipient_hash=?').get(recipientHash(recipient));
        if (!match) return false;
        db.prepare('UPDATE whatsapp_connections SET opted_in=0,recipient_hash=NULL,recipient_cipher=NULL,recipient_label=NULL,appointment_alerts=0,walk_alerts=0,consent_version=consent_version+1,updated_at=? WHERE owner_id=?').run(now, match.owner_id);
        db.prepare('DELETE FROM whatsapp_pairings WHERE owner_id=?').run(match.owner_id);
        cancelQueued(match.owner_id, now); return true;
      });
    },
    status(owner, now) {
      const row = connection(owner);
      const pending = db.prepare('SELECT expires_at FROM whatsapp_pairings WHERE owner_id=? AND expires_at>?').get(owner, now);
      return { connected: row?.opted_in === 1, recipientLabel: row?.recipient_label ?? null,
        preferences: { appointmentAlerts: row?.appointment_alerts === 1, walkAlerts: row?.walk_alerts === 1 },
        pendingPairing: pending ? { expiresAt: new Date(pending.expires_at).toISOString() } : null,
        reminders: db.prepare('SELECT * FROM whatsapp_jobs WHERE owner_id=? ORDER BY created_at DESC LIMIT 50').all(owner).map(publicJob) };
    },
    schedule(owner, input, now) {
      validateOwner(owner);
      return transaction(() => {
        if (input.eventAt <= now + 5_000 || input.expiresAt <= now) throw new WhatsAppError(400, 'invalid_reminder', 'Choose a future reminder time.');
        const linked = connection(owner);
        if (linked?.opted_in !== 1 || !(input.kind === 'walk' ? linked.walk_alerts : linked.appointment_alerts)) throw new WhatsAppError(409, 'opt_in_required', 'Connect and opt in to this type of WhatsApp alert first.');
        const existing = db.prepare('SELECT * FROM whatsapp_jobs WHERE owner_id=? AND pet_id=? AND client_id=?').get(owner, input.petId, input.clientReminderId);
        const same = existing && existing.pet_name === input.petName && existing.kind === input.kind && existing.lead_minutes === input.leadMinutes && existing.event_at === input.eventAt && existing.time_zone === input.timeZone && existing.consent_version === linked.consent_version;
        if (same) return { scheduled: existing.state === 'scheduled', reused: true, reminder: publicJob(existing) };
        if (existing && !['scheduled', 'cancelled', 'failed', 'expired'].includes(existing.state)) throw new WhatsAppError(409, 'already_dispatched', 'This reminder has already started sending. Create a new reminder rather than resending it.');
        if (db.prepare(`SELECT count(*) AS n FROM whatsapp_jobs WHERE owner_id=? AND state IN ${ACTIVE}`).get(owner).n >= 50 && existing?.state !== 'scheduled') throw new WhatsAppError(429, 'reminder_limit', 'There are too many scheduled WhatsApp reminders.');
        const id = existing?.id ?? createHash('sha256').update(JSON.stringify([owner, input.petId, input.clientReminderId])).digest('hex');
        db.prepare(`INSERT INTO whatsapp_jobs(id,owner_id,pet_id,client_id,pet_name,kind,lead_minutes,event_at,due_at,expires_at,time_zone,recipient_hash,consent_version,state,next_attempt_at,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'scheduled',?,?,?) ON CONFLICT(id) DO UPDATE SET
          pet_name=excluded.pet_name,kind=excluded.kind,lead_minutes=excluded.lead_minutes,event_at=excluded.event_at,due_at=excluded.due_at,expires_at=excluded.expires_at,time_zone=excluded.time_zone,
          recipient_hash=excluded.recipient_hash,consent_version=excluded.consent_version,state='scheduled',attempts=0,next_attempt_at=excluded.next_attempt_at,
          lease_token=NULL,lease_until=NULL,provider_id=NULL,error_code=NULL,updated_at=excluded.updated_at`)
          .run(id, owner, input.petId, input.clientReminderId, input.petName, input.kind, input.leadMinutes, input.eventAt, input.dueAt, input.expiresAt, input.timeZone, linked.recipient_hash, linked.consent_version, input.dueAt, now, now);
        return { scheduled: true, reused: false, reminder: publicJob(db.prepare('SELECT * FROM whatsapp_jobs WHERE id=?').get(id)) };
      });
    },
    cancel(owner, id, now) {
      validateOwner(owner);
      const row = db.prepare('SELECT * FROM whatsapp_jobs WHERE owner_id=? AND id=?').get(owner, id);
      if (!row) throw new WhatsAppError(404, 'reminder_not_found', 'That WhatsApp reminder was not found.');
      if (row.state === 'sending') throw new WhatsAppError(409, 'already_sending', 'This reminder is already sending and cannot be recalled. Turn off alerts to cancel future queued reminders.');
      if (row.state === 'scheduled') db.prepare("UPDATE whatsapp_jobs SET state='cancelled',error_code=NULL,updated_at=? WHERE owner_id=? AND id=? AND state='scheduled'").run(now, owner, id);
      return publicJob(db.prepare('SELECT * FROM whatsapp_jobs WHERE owner_id=? AND id=?').get(owner, id));
    },
    claimDue(now) {
      return transaction(() => {
        db.prepare("UPDATE whatsapp_jobs SET state='delivery_unknown',error_code='worker_interrupted',updated_at=? WHERE state='sending' AND lease_until<=?").run(now, now);
        db.prepare("UPDATE whatsapp_jobs SET state='expired',error_code='reminder_expired',updated_at=? WHERE state='scheduled' AND expires_at<=?").run(now, now);
        db.prepare('DELETE FROM whatsapp_webhook_events WHERE received_at<?').run(now - 14 * 86_400_000);
        db.prepare('DELETE FROM whatsapp_status_events WHERE status_at<?').run(now - 14 * 86_400_000);
        db.prepare("DELETE FROM whatsapp_jobs WHERE updated_at<? AND state NOT IN ('scheduled','sending')").run(now - 30 * 86_400_000);
        const candidates = db.prepare("SELECT * FROM whatsapp_jobs WHERE state='scheduled' AND due_at<=? AND next_attempt_at<=? AND expires_at>? ORDER BY due_at LIMIT 20").all(now, now, now);
        for (const row of candidates) {
          const linked = connection(row.owner_id);
          if (linked?.opted_in !== 1 || linked.consent_version !== row.consent_version || linked.recipient_hash !== row.recipient_hash) {
            db.prepare("UPDATE whatsapp_jobs SET state='cancelled',error_code='opted_out',updated_at=? WHERE id=?").run(now, row.id); continue;
          }
          if (db.prepare('SELECT count(*) AS n FROM whatsapp_jobs WHERE owner_id=? AND attempted_at>?').get(row.owner_id, now - 86_400_000).n >= 10 && row.attempts === 0) {
            db.prepare("UPDATE whatsapp_jobs SET state='failed',error_code='daily_limit',updated_at=? WHERE id=?").run(now, row.id); continue;
          }
          const lease = randomBytes(16).toString('hex');
          db.prepare("UPDATE whatsapp_jobs SET state='sending',attempts=attempts+1,lease_token=?,lease_until=?,attempted_at=?,updated_at=? WHERE id=? AND state='scheduled'").run(lease, now + 60_000, now, now, row.id);
          return db.prepare('SELECT * FROM whatsapp_jobs WHERE id=?').get(row.id);
        }
        return null;
      });
    },
    dispatchRecipient(job, now) {
      const current = db.prepare('SELECT * FROM whatsapp_jobs WHERE id=? AND state=\'sending\' AND lease_token=?').get(job.id, job.lease_token);
      if (current && current.expires_at <= now) throw new WhatsAppError(409, 'reminder_expired', 'This reminder is no longer timely and will not be sent.');
      const linked = connection(job.owner_id);
      if (!current || linked?.opted_in !== 1 || linked.consent_version !== job.consent_version || linked.recipient_hash !== job.recipient_hash) return null;
      return decrypt(linked.recipient_cipher);
    },
    accepted(job, providerId, now) {
      transaction(() => {
        db.prepare("UPDATE whatsapp_jobs SET state='accepted',provider_id=?,lease_token=NULL,lease_until=NULL,error_code=NULL,updated_at=? WHERE id=? AND state='sending' AND lease_token=?").run(providerId, now, job.id, job.lease_token);
        applyStatus(db.prepare('SELECT * FROM whatsapp_jobs WHERE id=?').get(job.id), db.prepare('SELECT * FROM whatsapp_status_events WHERE provider_id=?').get(providerId));
      });
    },
    failed(job, error, now) {
      const retry = error.retryable && !error.ambiguous && job.attempts < 3 && now + error.retryAfterMs < job.expires_at;
      const state = error.code === 'opted_out' ? 'cancelled' : error.code === 'reminder_expired' ? 'expired' : error.ambiguous ? 'delivery_unknown' : retry ? 'scheduled' : 'failed';
      db.prepare('UPDATE whatsapp_jobs SET state=?,error_code=?,next_attempt_at=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND state=\'sending\' AND lease_token=?')
        .run(state, error.code || 'provider_failed', now + Math.min(3_600_000, Math.max(error.retryAfterMs || 30_000, 30_000 * 2 ** (job.attempts - 1))), now, job.id, job.lease_token);
    },
    recordStatus(providerId, recipient, status, timestamp, eventKey, now) {
      return transaction(() => {
        if (!rememberEvent(eventKey, now)) return;
        const previous = db.prepare('SELECT * FROM whatsapp_status_events WHERE provider_id=?').get(providerId);
        if (previous && previous.status_at > timestamp) return;
        db.prepare(`INSERT INTO whatsapp_status_events VALUES(?,?,?,?) ON CONFLICT(provider_id) DO UPDATE SET recipient_hash=excluded.recipient_hash,status=excluded.status,status_at=excluded.status_at`)
          .run(providerId, recipientHash(recipient), status, timestamp);
        applyStatus(db.prepare('SELECT * FROM whatsapp_jobs WHERE provider_id=?').get(providerId), db.prepare('SELECT * FROM whatsapp_status_events WHERE provider_id=?').get(providerId));
      });
    },
    close() { db.close(); },
  };
}
