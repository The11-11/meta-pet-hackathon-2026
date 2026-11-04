import type { AppData, CareKind } from './types';
import { normalizePetHandle, prepareSocialPostData, withPetMention } from './socialData.ts';

export type MuseAction = {
  id: string; petId: string; expiresAt: string;
} & ({ type: 'record_care'; payload: { kind: CareKind; label: string; note: string; recordedAt: string } }
  | { type: 'add_appointment'; payload: { title: string; date: string; note: string } }
  | { type: 'draft_social_post'; payload: { profileId: string; platform: 'facebook' | 'instagram'; petHandle: string; caption: string; note: string } });

const kinds = ['feeding', 'walk', 'training', 'sleep', 'vet'];
const text = (value: unknown, max: number, empty = false): value is string => typeof value === 'string' && value.length <= max && (empty || !!value.trim());
const date = (value: unknown): value is string => text(value, 60) && /T.*(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

export function parseMuseAction(value: unknown): MuseAction {
  if (!value || typeof value !== 'object') throw new Error('Muse returned an invalid action.');
  const action = value as Record<string, unknown>;
  const payload = action.payload as Record<string, unknown> | undefined;
  if (!text(action.id, 100) || !text(action.petId, 100) || !date(action.expiresAt) || !payload || typeof payload !== 'object' || !text(payload.note, 1000, true)) throw new Error('Muse returned an invalid action.');
  const base = { id: action.id, petId: action.petId, expiresAt: action.expiresAt };
  if (action.type === 'draft_social_post' && text(payload.profileId, 100) && ['facebook', 'instagram'].includes(payload.platform as string) && text(payload.petHandle, 51) && text(payload.caption, 1800)) {
    const petHandle = normalizePetHandle(payload.petHandle);
    return { ...base, type: 'draft_social_post', payload: { profileId: payload.profileId, platform: payload.platform as 'facebook' | 'instagram', petHandle, caption: withPetMention(payload.caption, petHandle), note: payload.note } };
  }
  if (action.type === 'record_care' && kinds.includes(payload.kind as string) && text(payload.label, 120) && date(payload.recordedAt)) {
    return { ...base, type: 'record_care', payload: { kind: payload.kind as CareKind, label: payload.label, note: payload.note, recordedAt: payload.recordedAt } };
  }
  if (action.type === 'add_appointment' && text(payload.title, 100) && date(payload.date)) {
    return { ...base, type: 'add_appointment', payload: { title: payload.title, date: payload.date, note: payload.note } };
  }
  throw new Error('Muse returned an unsupported action.');
}

// Called only by the owner's approval control. Applying the same proposal twice
// has no effect, including after the app reloads its saved care records.
export function applyApprovedMuseAction(data: AppData, value: unknown, now = Date.now()): AppData {
  const action = parseMuseAction(value);
  if (action.petId !== data.pet.id) throw new Error('This suggestion belongs to another pet. Ask Muse again.');
  const id = `muse-${action.id}`;
  if (data.logs.some(log => log.id === id) || data.appointments.some(item => item.id === id) || data.social?.posts.some(item => item.id === id)) return data;
  if (Date.parse(action.expiresAt) <= now) throw new Error('This suggestion has expired. Ask Muse to prepare it again.');
  if (action.type === 'draft_social_post') return prepareSocialPostData(data, { id, ...action.payload }, now);
  if (action.type === 'record_care') {
    if (Date.parse(action.payload.recordedAt) > now + 60_000) throw new Error('A care entry cannot record a future activity as completed.');
    const { kind, ...record } = action.payload;
    return { ...data, logs: [{ id, type: kind, ...record }, ...data.logs] };
  }
  if (Date.parse(action.payload.date) <= now) throw new Error('Choose a future date for the appointment.');
  return { ...data, appointments: [...data.appointments, { id, ...action.payload }].sort((a, b) => a.date.localeCompare(b.date)) };
}
