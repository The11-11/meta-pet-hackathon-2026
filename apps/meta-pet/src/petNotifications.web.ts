import type { PetNotificationSound } from './types';

export type PetNotificationOptions = { petId: string; petName: string; sound: PetNotificationSound };
export type PetAppointmentNotificationOptions = PetNotificationOptions & { appointmentId: string; title: string; date: string };

export const PET_NOTIFICATION_PREVIEW_MESSAGE = 'Sound preview only on web. Use a Muse Pet app build on your phone for bark and meow notifications.';

export async function getPetNotificationPermission(): Promise<boolean> {
  return false;
}

export async function requestPetNotificationPermission(): Promise<boolean> {
  return false;
}

export async function schedulePetTestNotification(_options: PetNotificationOptions): Promise<string> {
  throw new Error(PET_NOTIFICATION_PREVIEW_MESSAGE);
}

export async function schedulePetAppointmentReminder(_options: PetAppointmentNotificationOptions): Promise<string | null> {
  return null;
}

export async function cancelPetNotification(_id: string): Promise<void> {}
export async function cancelPetNotificationsForPet(_petId: string): Promise<void> {}
export async function cancelAllPetNotifications(): Promise<void> {}
