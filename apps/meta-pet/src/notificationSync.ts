import type { Appointment, PetNotificationSound } from './types';

export type PetReminderTarget = { petId: string; petName: string; enabled: boolean; sound: PetNotificationSound; appointments: Appointment[] };
export type PetReminderApi = {
  cancelAllPetNotifications: () => Promise<void>;
  cancelPetNotification: (id: string) => Promise<void>;
  schedulePetAppointmentReminder: (input: {petId: string; petName: string; appointmentId: string; title: string; date: string; sound: PetNotificationSound}) => Promise<string | null>;
};

export type PetReminderPermissionApi = PetReminderApi & { getPetNotificationPermission: () => Promise<boolean> };

/** Recheck OS permission on mount/foreground, preserving the owner's opt-in. */
export async function refreshPetReminders(target: PetReminderTarget | null, api: PetReminderPermissionApi, isCurrent: () => boolean, now = Date.now()): Promise<{ permission: boolean | null; count: number }> {
  if (!isCurrent()) return { permission: null, count: 0 };
  const permission = await api.getPetNotificationPermission();
  if (!isCurrent()) return { permission: null, count: 0 };
  const count = await syncPetReminders(target ? { ...target, enabled: target.enabled && permission } : null, api, isCurrent, now);
  return { permission, count };
}

/** Call through one ordered queue so a stale owner cannot leave future alerts. */
export async function syncPetReminders(target: PetReminderTarget | null, api: PetReminderApi, isCurrent: () => boolean, now = Date.now()): Promise<number> {
  await api.cancelAllPetNotifications();
  if (!target?.enabled || !isCurrent()) return 0;
  const upcoming = target.appointments.filter(item => Number.isFinite(Date.parse(item.date)) && Date.parse(item.date) > now)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).slice(0, 50);
  let count = 0;
  for (const appointment of upcoming) {
    if (!isCurrent()) break;
    const id = await api.schedulePetAppointmentReminder({ petId: target.petId, petName: target.petName, appointmentId: appointment.id, title: appointment.title, date: appointment.date, sound: target.sound });
    if (!isCurrent()) { if (id) await api.cancelPetNotification(id); break; }
    if (id) count++;
  }
  return count;
}
