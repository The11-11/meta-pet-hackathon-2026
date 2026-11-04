import type { PetNotificationPreferences, PetNotificationSound } from './types';

export const petSoundLabels: Record<PetNotificationSound, string> = { bark: 'Bark', meow: 'Meow', default: 'Default', silent: 'Quiet' };

export function petNotificationPreferences(value: unknown, species: string): PetNotificationPreferences {
  const selected = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const fallback: PetNotificationSound = species.toLowerCase() === 'cat' ? 'meow' : species.toLowerCase() === 'dog' ? 'bark' : 'default';
  return { enabled: selected.enabled === true, sound: typeof selected.sound === 'string' && Object.hasOwn(petSoundLabels, selected.sound) ? selected.sound as PetNotificationSound : fallback };
}
