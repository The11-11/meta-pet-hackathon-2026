import { parsePetAvatar } from './petAvatarData.ts';
import type { AppData, CareKind, PetProfile } from './types';

export const DEMO_HANDOFF_KEY = 'muse.pet.demo-facebook-handoff.v1';
export const DEMO_PROFILE_STORAGE_KEY = 'muse.pet.owner.v2.demo.preview';
export const DEMO_HANDOFF_TTL = 30 * 60 * 1000;
const kinds: CareKind[] = ['feeding', 'walk', 'training', 'sleep', 'vet'];
type Profile = Omit<PetProfile, 'id'>;
export type DemoProfileHandoff = { id: string; ownerId: string; profile: Profile; goals: CareKind[]; expiresAt: number };
export type HandoffStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };
type Invitation = { version: 1; id: string; createdAt: number; expiresAt: number; sourcePetId: string; sourceSignature: string; ownerId: string | null };
const queues = new WeakMap<HandoffStorage, Promise<unknown>>();

function serial<T>(storage: HandoffStorage, operation: () => Promise<T>): Promise<T> {
  const pending = (queues.get(storage) ?? Promise.resolve()).catch(() => {}).then(operation);
  queues.set(storage, pending.catch(() => {}));
  return pending;
}
function validId(value: unknown, max = 200): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}
function text(value: unknown, max: number, required = false, multiline = false): string {
  const controls = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
  if (typeof value !== 'string' || value.length > max || controls.test(value) || (required && !value.trim())) throw new Error('Check the demo pet profile before connecting Facebook.');
  return value.trim();
}
function project(value: unknown): { sourcePetId: string; profile: Profile; goals: CareKind[] } {
  if (!value || typeof value !== 'object') throw new Error('The saved demo profile could not be read.');
  const data = value as Record<string, unknown>;
  if (!data.pet || typeof data.pet !== 'object' || !data.onboarding || typeof data.onboarding !== 'object') throw new Error('Finish the demo pet profile before connecting Facebook.');
  const pet = data.pet as Record<string, unknown>;
  const setup = data.onboarding as Record<string, unknown>;
  if (!validId(pet.id, 100) || setup.completed !== true || !Array.isArray(setup.goals) || setup.goals.length > 5 || setup.goals.some(goal => !kinds.includes(goal as CareKind))) throw new Error('Finish the demo pet profile before connecting Facebook.');
  const goals = [...new Set(setup.goals)] as CareKind[];
  if (!goals.length || !['Dog', 'Cat', 'Other'].includes(pet.species as string)) throw new Error('Check the demo pet species and care goals.');
  const careNeeds = pet.careNeeds === undefined ? '' : text(pet.careNeeds, 500, false, true);
  const avatar = parsePetAvatar(pet.avatar);
  if (pet.avatar !== undefined && !avatar) throw new Error('The saved Muse avatar is unsupported. Save the demo profile again.');
  const profile: Profile = { name: text(pet.name, 50, true), species: pet.species as string, breed: text(pet.breed, 80), age: text(pet.age, 40), ...(careNeeds ? { careNeeds } : {}), ...(avatar ? { avatar } : {}) };
  return { sourcePetId: pet.id, profile, goals };
}
// This non-secret fingerprint detects a changed local source. It is not an
// authentication mechanism: only the separately verified Facebook owner may accept.
function signature(value: unknown): string {
  const input = JSON.stringify(value);
  let first = 0x811c9dc5, second = 0x9e3779b9;
  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return (first >>> 0).toString(16).padStart(8, '0') + (second >>> 0).toString(16).padStart(8, '0') + ':' + input.length;
}
function parseInvitation(raw: string, now: number): Invitation | null {
  try {
    if (raw.length > 1500 || !Number.isFinite(now)) return null;
    const value = JSON.parse(raw) as Invitation;
    if (value.version !== 1 || !validId(value.id, 100) || !validId(value.sourcePetId, 100) || typeof value.sourceSignature !== 'string' || !/^[a-f0-9]{16}:\d{1,8}$/.test(value.sourceSignature) ||
      !Number.isSafeInteger(value.createdAt) || !Number.isSafeInteger(value.expiresAt) || value.expiresAt - value.createdAt !== DEMO_HANDOFF_TTL || value.createdAt > now || value.expiresAt <= now ||
      (value.ownerId !== null && !validId(value.ownerId))) return null;
    return { version: 1, id: value.id, createdAt: value.createdAt, expiresAt: value.expiresAt, sourcePetId: value.sourcePetId, sourceSignature: value.sourceSignature, ownerId: value.ownerId };
  } catch { return null; }
}
async function removeUnchanged(storage: HandoffStorage, raw: string): Promise<boolean> {
  if (await storage.getItem(DEMO_HANDOFF_KEY) !== raw) return false;
  await storage.removeItem(DEMO_HANDOFF_KEY);
  return true;
}

/** Prepare an invitation, never an account import, before leaving for OAuth. */
export function stageDemoProfileHandoff(storage: HandoffStorage, currentDemo: AppData, now = Date.now()): Promise<string> {
  return serial(storage, async () => {
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('The device time could not be checked.');
    const projected = project(currentDemo);
    const raw = await storage.getItem(DEMO_PROFILE_STORAGE_KEY);
    if (!raw || raw.length > 6_000_000) throw new Error('Save the demo profile on this device before connecting Facebook.');
    let persisted: ReturnType<typeof project>;
    try { persisted = project(JSON.parse(raw)); } catch { throw new Error('The saved demo profile could not be read. Save it again before connecting Facebook.'); }
    if (signature(persisted) !== signature(projected)) throw new Error('Save your latest demo pet details before connecting Facebook.');
    const invitation: Invitation = { version: 1, id: 'handoff-' + now + '-' + Math.random().toString(36).slice(2, 12), createdAt: now, expiresAt: now + DEMO_HANDOFF_TTL, sourcePetId: projected.sourcePetId, sourceSignature: signature(projected), ownerId: null };
    await storage.setItem(DEMO_HANDOFF_KEY, JSON.stringify(invitation));
    return invitation.id;
  });
}

async function resolveHandoff(storage: HandoffStorage, verifiedOwnerId: string, now: number, initiatingId?: string): Promise<DemoProfileHandoff | null> {
  if (!validId(verifiedOwnerId)) throw new Error('Verify your Facebook account before reviewing the demo profile.');
  const raw = await storage.getItem(DEMO_HANDOFF_KEY);
  if (!raw) return null;
  const invitation = parseInvitation(raw, now);
  if (!invitation) { await removeUnchanged(storage, raw); return null; }
  if (initiatingId !== undefined && invitation.id !== initiatingId) return null;
  if (invitation.ownerId !== null && invitation.ownerId !== verifiedOwnerId) return null;
  // Merely mounting an account can never claim an invitation started elsewhere.
  if (invitation.ownerId === null && initiatingId === undefined) return null;
  const source = await storage.getItem(DEMO_PROFILE_STORAGE_KEY);
  let projected: ReturnType<typeof project>;
  try {
    if (!source || source.length > 6_000_000) throw new Error('Missing source');
    projected = project(JSON.parse(source));
  } catch { await removeUnchanged(storage, raw); return null; }
  if (projected.sourcePetId !== invitation.sourcePetId || signature(projected) !== invitation.sourceSignature) { await removeUnchanged(storage, raw); return null; }
  if (await storage.getItem(DEMO_HANDOFF_KEY) !== raw) return null;
  if (invitation.ownerId === null) {
    const bound = JSON.stringify({ ...invitation, ownerId: verifiedOwnerId });
    await storage.setItem(DEMO_HANDOFF_KEY, bound);
    if (await storage.getItem(DEMO_HANDOFF_KEY) !== bound) return null;
  }
  return { id: invitation.id, ownerId: verifiedOwnerId, profile: projected.profile, goals: projected.goals, expiresAt: invitation.expiresAt };
}

/** Only the verified callback from the initiating OAuth flow may bind it. */
export function bindDemoProfileHandoff(storage: HandoffStorage, initiatingId: string, verifiedOwnerId: string, now = Date.now()): Promise<DemoProfileHandoff | null> {
  return serial(storage, async () => validId(initiatingId, 100) ? await resolveHandoff(storage, verifiedOwnerId, now, initiatingId) : null);
}

/** Review an invitation already bound by its initiating verified callback. */
export function loadDemoProfileHandoff(storage: HandoffStorage, verifiedOwnerId: string, now = Date.now()): Promise<DemoProfileHandoff | null> {
  return serial(storage, () => resolveHandoff(storage, verifiedOwnerId, now));
}

/** Dismiss/consume only the exact invitation and, when supplied, bound account. */
export function clearDemoProfileHandoff(storage: HandoffStorage, id: string, verifiedOwnerId?: string): Promise<boolean> {
  return serial(storage, async () => {
    const raw = await storage.getItem(DEMO_HANDOFF_KEY);
    if (!raw || raw.length > 1500) return false;
    let invitation: Invitation;
    try { invitation = JSON.parse(raw) as Invitation; } catch { return false; }
    if (invitation.id !== id || (verifiedOwnerId !== undefined && invitation.ownerId !== verifiedOwnerId)) return false;
    return await removeUnchanged(storage, raw);
  });
}

/** Pure explicit accept: preserve the fresh account's identity and connection. */
export function applyDemoProfileHandoff(target: AppData, handoff: DemoProfileHandoff, verifiedOwnerId: string, now = Date.now()): AppData {
  if (!validId(verifiedOwnerId) || handoff.ownerId !== verifiedOwnerId || !validId(handoff.id, 100) || !Number.isFinite(handoff.expiresAt) || handoff.expiresAt <= now) throw new Error('Verify this Facebook account and review the demo profile again.');
  if (!target.pet || !validId(target.pet.id, 100) || target.pet.name.trim() || target.onboarding?.completed || target.logs.length || target.appointments.length || target.rewards.length || target.muse || target.social?.profiles.length || target.social?.posts.length) throw new Error('This Facebook account already has saved pet data. Keep that profile; the demo has not been changed.');
  const validated = project({ pet: { ...handoff.profile, id: target.pet.id }, onboarding: { completed: true, goals: handoff.goals } });
  return { ...target, pet: { id: target.pet.id, ...validated.profile }, onboarding: { completed: true, goals: validated.goals } };
}

function persistedTarget(value: unknown): AppData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Saved account data could not be checked. Reopen the account before keeping the demo profile.');
  const data = value as Record<string, unknown>;
  if (!data.pet || typeof data.pet !== 'object' || Array.isArray(data.pet) || !Array.isArray(data.logs) || !Array.isArray(data.appointments) || !Array.isArray(data.rewards) || typeof data.backendUrl !== 'string' || data.backendUrl.length > 2048 || /[\u0000-\u001f\u007f]/.test(data.backendUrl)) throw new Error('Saved account data could not be checked.');
  const pet = data.pet as Record<string, unknown>;
  if (!validId(pet.id, 100) || !['Dog', 'Cat', 'Other'].includes(pet.species as string)) throw new Error('Saved account pet identity could not be checked.');
  const avatar = parsePetAvatar(pet.avatar);
  if (pet.avatar !== undefined && !avatar) throw new Error('Saved account avatar could not be checked.');
  const name = text(pet.name, 50), breed = text(pet.breed, 80), age = text(pet.age, 40);
  const careNeeds = pet.careNeeds === undefined ? '' : text(pet.careNeeds, 500, false, true);
  const result: AppData = { pet: { id: pet.id, name, species: pet.species as string, breed, age, ...(careNeeds ? { careNeeds } : {}), ...(avatar ? { avatar } : {}) }, logs: data.logs as AppData['logs'], appointments: data.appointments as AppData['appointments'], rewards: data.rewards as AppData['rewards'], backendUrl: data.backendUrl };
  if (data.onboarding !== undefined) {
    const setup = data.onboarding as Record<string, unknown>;
    if (!setup || typeof setup !== 'object' || typeof setup.completed !== 'boolean' || !Array.isArray(setup.goals) || setup.goals.length > 5 || setup.goals.some(goal => !kinds.includes(goal as CareKind))) throw new Error('Saved account setup could not be checked.');
    result.onboarding = { completed: setup.completed, goals: [...new Set(setup.goals)] as CareKind[] };
  }
  if (data.notifications !== undefined) {
    const preferences = data.notifications as Record<string, unknown>;
    if (!preferences || typeof preferences !== 'object' || typeof preferences.enabled !== 'boolean' || !['bark', 'meow', 'default', 'silent'].includes(preferences.sound as string)) throw new Error('Saved account alert preferences could not be checked.');
    result.notifications = { enabled: preferences.enabled, sound: preferences.sound as NonNullable<AppData['notifications']>['sound'] };
  }
  // Existing conversations or social data are never candidates for replacement.
  if (data.muse !== undefined) throw new Error('This Facebook account already has conversation data. Keep that profile.');
  if (data.social !== undefined) {
    const social = data.social as Record<string, unknown>;
    if (!social || typeof social !== 'object' || !Array.isArray(social.profiles) || !Array.isArray(social.posts)) throw new Error('Saved account social data could not be checked.');
    result.social = { profiles: social.profiles as NonNullable<AppData['social']>['profiles'], posts: social.posts as NonNullable<AppData['social']>['posts'] };
  }
  return result;
}

/** Save before the caller publishes; the caller supplies a fresh owner/session guard. */
export function persistDemoProfileHandoff(storage: HandoffStorage, targetStorageKey: string, currentTarget: AppData, handoffId: string, verifiedOwnerId: string, isCurrent: () => boolean, now?: number): Promise<AppData> {
  return serial(storage, async () => {
    const expectedKey = 'muse.pet.owner.v2.facebook.' + encodeURIComponent(verifiedOwnerId);
    if (!validId(verifiedOwnerId) || targetStorageKey !== expectedKey || !validId(handoffId, 100) || !isCurrent()) throw new Error('Your account changed. Reopen the profile before keeping it.');
    const current = persistedTarget(currentTarget);
    const raw = await storage.getItem(targetStorageKey);
    if (!isCurrent()) throw new Error('Your account changed while checking its saved profile.');
    let latest = current;
    if (raw !== null) {
      try {
        if (raw.length > 6_000_000) throw new Error('Oversized account data');
        latest = persistedTarget(JSON.parse(raw));
      } catch { throw new Error('Saved account data could not be checked. Reopen it before keeping the demo profile.'); }
    }
    if (latest.pet.id !== current.pet.id) throw new Error('The saved account pet changed. Reopen it before keeping the demo profile.');
    // Re-read the source and exact invitation AFTER reading the target: awaiting
    // target storage must not let an edited demo or a replaced invitation slip in.
    const handoff = await resolveHandoff(storage, verifiedOwnerId, now ?? Date.now());
    if (!handoff || handoff.id !== handoffId) throw new Error('The demo profile invitation changed or expired. Connect Facebook from the demo again.');
    applyDemoProfileHandoff(current, handoff, verifiedOwnerId, now ?? Date.now());
    const next = applyDemoProfileHandoff(latest, handoff, verifiedOwnerId, now ?? Date.now());
    if (!isCurrent()) throw new Error('Your account changed before the profile could be saved.');
    await storage.setItem(targetStorageKey, JSON.stringify(next));
    if (!isCurrent()) throw new Error('Your account changed after saving. Reopen the account to check its saved profile.');
    return next;
  });
}
