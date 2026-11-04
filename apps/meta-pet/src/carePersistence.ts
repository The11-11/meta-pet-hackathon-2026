import type { AppData, PetProfile } from './types';

export function queueCareWrite(previous: Promise<void>, write: () => Promise<void>): Promise<void> {
  return previous.catch(() => {}).then(write);
}

export async function persistPetProfile(
  current: AppData,
  pet: PetProfile,
  commit: (next: AppData) => Promise<void>,
  onChanged: () => void,
): Promise<void> {
  const changed = JSON.stringify(pet) !== JSON.stringify(current.pet);
  if (changed) onChanged();
  // An unchanged value can still be an optimistic result of a failed save.
  // Queue a real write and await it before callers report completion.
  await commit(changed ? { ...current, pet, muse: undefined } : current);
}
