import type { AppData, CareKind, PetProfile } from './types';
import { parsePetAvatar } from './petAvatarData.ts';

export type Owner = { id: string; name: string; mode: 'facebook' | 'demo' };
export const DEMO_OWNER: Owner = { id: 'preview', name: 'Pet parent', mode: 'demo' };
const kinds: CareKind[] = ['feeding', 'walk', 'training', 'sleep', 'vet'];

export function ownerStorageKey(owner: Owner | null): string | null {
  return owner ? `muse.pet.owner.v2.${owner.mode}.${encodeURIComponent(owner.id)}` : null;
}

export function freshOwnerData(owner: Pick<Owner, 'mode'> | null, backendUrl = '', petId = `pet-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`): AppData {
  return { pet: { id: petId, name: '', species: 'Dog', breed: '', age: '' }, logs: [], appointments: [], rewards: [], backendUrl: owner?.mode === 'facebook' ? backendUrl : '', onboarding: { completed: false, goals: ['feeding', 'walk'] } };
}

// Restore only a bounded optional note; older profiles do not need this field.
export function restoreCareNeeds(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 500) : undefined;
}

export function completeOwnerSetup(data: AppData, pet: PetProfile, goals: CareKind[]): AppData {
  if (!pet.name.trim() || pet.name.length > 50 || !['Dog', 'Cat', 'Other'].includes(pet.species) || pet.breed.length > 80 || pet.age.length > 40 || (pet.careNeeds !== undefined && (typeof pet.careNeeds !== 'string' || pet.careNeeds.length > 500))) throw new Error('Enter a pet name and check the profile details.');
  const chosen = [...new Set(goals)].filter(goal => kinds.includes(goal));
  if (!chosen.length) throw new Error('Choose at least one care goal.');
  const avatar = parsePetAvatar(pet.avatar);
  const careNeeds = restoreCareNeeds(pet.careNeeds);
  return { ...data, pet: { id: data.pet.id, name: pet.name.trim(), species: pet.species, breed: pet.breed.trim(), age: pet.age.trim(), ...(careNeeds ? { careNeeds } : {}), ...(avatar ? { avatar } : {}) }, muse: undefined, onboarding: { completed: true, goals: chosen } };
}

export function parseOwner(user: unknown): Owner | null {
  if (!user || typeof user !== 'object') return null;
  const profile = user as Record<string, unknown>;
  if (typeof profile.id !== 'string' || !profile.id.trim() || profile.id.length > 200 || typeof profile.name !== 'string' || !profile.name.trim()) return null;
  return { id: profile.id, name: profile.name.trim().slice(0, 100), mode: 'facebook' };
}
