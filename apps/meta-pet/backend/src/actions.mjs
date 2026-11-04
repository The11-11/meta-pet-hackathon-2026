import { randomUUID } from 'node:crypto';

const string = (description) => ({ type: 'string', description });
const tool = (name, description, properties) => ({ type: 'function', name, description, strict: true, parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } });
export const MUSE_TOOLS = [
  tool('prepare_care_entry', 'Prepare a care entry for owner review. Does not save anything. Only use for an activity the owner says happened; ask for missing details.', {
    kind: { type: 'string', enum: ['feeding', 'walk', 'training', 'sleep', 'vet'] },
    label: string('Short entry label, at most 120 characters.'), note: string('Owner-provided observations, at most 1000 characters; empty if none.'),
    recordedAt: string('Time the activity happened, ISO 8601 with timezone. Use contextGeneratedAt if the owner explicitly says now.'),
  }),
  tool('prepare_appointment', 'Prepare an appointment entry on this device for owner approval. This does not book a vet, send a message, or create a reminder. Ask for exact date, time and timezone if missing.', {
    title: string('Appointment title, at most 100 characters.'), date: string('Future ISO 8601 date and time with timezone.'), note: string('Owner-provided appointment notes, at most 1000 characters; empty if none.'),
  }),
  tool('prepare_social_post', 'Prepare a social caption for owner review and saving as a draft on this device. Use an exact supplied socialProfiles id. This never creates an account, connects a page, publishes, or sends anything.', {
    profileId: { ...string('Exact id of the owner-supplied Facebook or Instagram profile plan.'), maxLength: 100 },
    caption: { ...string('Post caption, at most 1800 characters including the required @handle mention. Do not include health or location details unless the owner explicitly chooses them.'), maxLength: 1800 },
    note: { ...string('Short drafting note, at most 1000 characters; empty if none. Never claim publication or access to account metrics.'), maxLength: 1000 },
  }),
];

export function hasSocialMention(caption, handle) {
  const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mention = new RegExp(`(^|[^A-Za-z0-9_.@])@${escaped}(?![A-Za-z0-9_.])`, 'i');
  return mention.test(caption);
}

export function tagSocialCaption(caption, handle) {
  if (typeof caption !== 'string' || !caption.trim() || caption.length > 1800 || typeof handle !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9._]{0,49}$/.test(handle)) throw new Error('Invalid social caption');
  const value = caption.trim();
  const tagged = hasSocialMention(value, handle) ? value : `${value}\n@${handle}`;
  if (tagged.length > 1800) throw new Error('Social caption including its pet mention is too long');
  return tagged;
}

export function prepareAction(call, input, now = Date.now()) {
  if (!input.pet.id || typeof call.arguments !== 'string' || call.arguments.length > 6000) throw new Error('Invalid action');
  const payload = JSON.parse(call.arguments);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid action');
  const text = (key, max, empty = false) => {
    if (typeof payload[key] !== 'string' || payload[key].length > max || (!empty && !payload[key].trim())) throw new Error('Invalid action');
    return payload[key].trim();
  };
  const date = key => {
    const value = text(key, 60);
    if (!/T.*(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Invalid action date');
    return new Date(value).toISOString();
  };
  const base = { id: randomUUID(), petId: input.pet.id, expiresAt: new Date(now + 15 * 60_000).toISOString() };
  if (call.name === 'prepare_care_entry') {
    if (!MUSE_TOOLS[0].parameters.properties.kind.enum.includes(payload.kind)) throw new Error('Invalid kind');
    const recordedAt = date('recordedAt');
    if (Date.parse(recordedAt) > now + 60_000) throw new Error('Future care entry');
    return { ...base, type: 'record_care', payload: { kind: payload.kind, label: text('label', 120), note: text('note', 1000, true), recordedAt } };
  }
  if (call.name === 'prepare_appointment') {
    const appointmentDate = date('date');
    if (Date.parse(appointmentDate) <= now) throw new Error('Past appointment');
    return { ...base, type: 'add_appointment', payload: { title: text('title', 100), date: appointmentDate, note: text('note', 1000, true) } };
  }
  if (call.name === 'prepare_social_post') {
    const profileId = text('profileId', 100);
    const profile = input.socialProfiles?.find(item => item.id === profileId);
    if (!profile || !['facebook', 'instagram'].includes(profile.platform)) throw new Error('Choose an existing social profile plan');
    return { ...base, type: 'draft_social_post', payload: { profileId, platform: profile.platform, petHandle: profile.handle, caption: tagSocialCaption(text('caption', 1800), profile.handle), note: text('note', 1000, true) } };
  }
  throw new Error('Unsupported tool');
}
