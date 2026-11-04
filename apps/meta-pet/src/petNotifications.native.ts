import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { PetAppointmentNotificationOptions, PetNotificationOptions } from './petNotifications.web';
import type { PetNotificationSound } from './types';

export type { PetAppointmentNotificationOptions, PetNotificationOptions } from './petNotifications.web';
export { PET_NOTIFICATION_PREVIEW_MESSAGE } from './petNotifications.web';

type NotificationModule = typeof import('expo-notifications');
const SOURCE = 'muse-pet';
const BUILD_MESSAGE = 'Bark and meow alerts need a Muse Pet app build with its sound files. You can preview the sounds here, then try alerts in a new phone build.';
const CHANNELS = { bark: 'muse-bark-v1', meow: 'muse-meow-v2', default: 'muse-default-v1', silent: 'muse-silent-v1' } as const;
let nativeModule: Promise<NotificationModule> | undefined;
let allCancellationVersion = 0;
const petCancellationVersions = new Map<string, number>();

function assertBuild(): void {
  if (isRunningInExpoGo()) throw new Error(BUILD_MESSAGE);
  const plugin = Constants.expoConfig?.plugins?.find(entry => Array.isArray(entry) && entry[0] === 'expo-notifications');
  const sounds: unknown = Array.isArray(plugin) ? plugin[1]?.sounds : undefined;
  if (!Array.isArray(sounds) || !['bark.wav', 'meow_v2.wav'].every(name => sounds.some(path => typeof path === 'string' && path.split(/[\\/]/).pop() === name))) {
    throw new Error(BUILD_MESSAGE);
  }
}

async function notifications(): Promise<NotificationModule> {
  // Loading this service never loads the native module or requests OS permission.
  if (!nativeModule) {
    nativeModule = import('expo-notifications').then(module => {
      module.setNotificationHandler({
        handleNotification: async notification => {
          const data = notification.request.content.data;
          const own = data?.source === SOURCE;
          const audible = own && data.sound !== 'silent';
          return { shouldPlaySound: audible, shouldShowBanner: audible, shouldShowList: own, shouldSetBadge: false };
        },
      });
      return module;
    }).catch(() => {
      nativeModule = undefined;
      throw new Error(BUILD_MESSAGE);
    });
  }
  return nativeModule;
}

function soundFile(sound: PetNotificationSound): string | false {
  return sound === 'silent' ? false : sound === 'default' ? 'default' : sound === 'meow' ? 'meow_v2.wav' : 'bark.wav';
}

async function ensureChannels(module: NotificationModule): Promise<void> {
  if (Platform.OS !== 'android') return;
  for (const sound of Object.keys(CHANNELS) as PetNotificationSound[]) {
    // Versioned IDs keep Android's immutable sound setting distinct for each choice.
    if (await module.getNotificationChannelAsync(CHANNELS[sound])) continue;
    await module.setNotificationChannelAsync(CHANNELS[sound], {
      name: sound === 'silent' ? 'Muse Pet · Silent' : `Muse Pet · ${sound[0].toUpperCase()}${sound.slice(1)}`,
      importance: sound === 'silent' ? module.AndroidImportance.DEFAULT : module.AndroidImportance.HIGH,
      sound: sound === 'silent' ? null : soundFile(sound) as string,
      enableVibrate: sound !== 'silent',
      showBadge: false,
      lockscreenVisibility: module.AndroidNotificationVisibility.PRIVATE,
      bypassDnd: false,
    });
  }
}

function permitted(module: NotificationModule, permission: Awaited<ReturnType<NotificationModule['getPermissionsAsync']>>): boolean {
  if (Platform.OS === 'ios' && permission.ios) {
    return [module.IosAuthorizationStatus.AUTHORIZED, module.IosAuthorizationStatus.PROVISIONAL, module.IosAuthorizationStatus.EPHEMERAL].includes(permission.ios.status);
  }
  return permission.granted;
}

function validatePet(options: PetNotificationOptions): void {
  if (!options.petId?.trim() || options.petId.length > 200 || !options.petName?.trim() || options.petName.length > 80 || !Object.hasOwn(CHANNELS, options.sound)) {
    throw new Error('Choose a pet and a notification sound first.');
  }
}

function scopeVersion(petId: string): string {
  return `${allCancellationVersion}:${petCancellationVersions.get(petId) ?? 0}`;
}

function channelTrigger(sound: PetNotificationSound) {
  return Platform.OS === 'android' ? { channelId: CHANNELS[sound] } : {};
}

/** Read-only permission refresh; returning from Settings never prompts. */
export async function getPetNotificationPermission(): Promise<boolean> {
  if (isRunningInExpoGo()) return false;
  const module = await notifications();
  return permitted(module, await module.getPermissionsAsync());
}

/** Call only from the owner's explicit Enable button. Scheduling never calls this. */
export async function requestPetNotificationPermission(): Promise<boolean> {
  assertBuild();
  const module = await notifications();
  await ensureChannels(module);
  const current = await module.getPermissionsAsync();
  if (permitted(module, current)) return true;
  if (!current.canAskAgain) return false;
  const permission = await module.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return permitted(module, permission);
}

/** The caller must verify a current owner and enabled setting before scheduling. */
export async function schedulePetTestNotification(options: PetNotificationOptions): Promise<string> {
  validatePet(options);
  assertBuild();
  const version = scopeVersion(options.petId);
  const module = await notifications();
  if (!permitted(module, await module.getPermissionsAsync())) throw new Error('Enable pet notifications first. If permission was declined, allow notifications in your phone settings.');
  await ensureChannels(module);
  if (version !== scopeVersion(options.petId)) throw new Error('Pet alerts changed. Try the sound test again.');
  const id = await module.scheduleNotificationAsync({
    content: {
      title: 'Muse Pet sound check',
      body: options.sound === 'silent' ? `${options.petName.trim()}’s silent alert is ready.` : `${options.petName.trim()}’s ${options.sound === 'default' ? 'notification' : options.sound} alert is ready.`,
      sound: soundFile(options.sound),
      data: { source: SOURCE, kind: 'test', petId: options.petId, sound: options.sound },
    },
    trigger: { type: module.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2, repeats: false, ...channelTrigger(options.sound) },
  });
  if (version !== scopeVersion(options.petId)) {
    await module.cancelScheduledNotificationAsync(id);
    throw new Error('Pet alerts changed. Try the sound test again.');
  }
  return id;
}

export async function schedulePetAppointmentReminder(options: PetAppointmentNotificationOptions): Promise<string | null> {
  validatePet(options);
  const appointmentAt = Date.parse(options.date);
  if (!options.appointmentId?.trim() || options.appointmentId.length > 200 || !options.title?.trim() || options.title.length > 100 || !Number.isFinite(appointmentAt)) {
    throw new Error('Choose a saved appointment with a valid date first.');
  }
  if (appointmentAt <= Date.now()) return null;
  assertBuild();
  const version = scopeVersion(options.petId);
  const module = await notifications();
  if (!permitted(module, await module.getPermissionsAsync())) return null;
  await ensureChannels(module);
  const now = Date.now();
  if (appointmentAt <= now || version !== scopeVersion(options.petId)) return null;
  const early = appointmentAt - 15 * 60 * 1000;
  const reminderAt = early > now ? early : appointmentAt;
  const id = await module.scheduleNotificationAsync({
    identifier: `muse-pet:appointment:${encodeURIComponent(options.petId)}:${encodeURIComponent(options.appointmentId)}`,
    content: {
      title: `${options.petName.trim()}: ${options.title.trim()}`,
      body: reminderAt === early ? 'Your appointment is in about 15 minutes.' : 'It’s time for your saved appointment.',
      sound: soundFile(options.sound),
      data: { source: SOURCE, kind: 'appointment', petId: options.petId, appointmentId: options.appointmentId, sound: options.sound },
    },
    trigger: { type: module.SchedulableTriggerInputTypes.DATE, date: new Date(reminderAt), ...channelTrigger(options.sound) },
  });
  if (version !== scopeVersion(options.petId)) {
    await module.cancelScheduledNotificationAsync(id);
    return null;
  }
  return id;
}

export async function cancelPetNotification(id: string): Promise<void> {
  if (!id || isRunningInExpoGo()) return;
  const module = await notifications();
  await module.cancelScheduledNotificationAsync(id);
  await module.dismissNotificationAsync(id);
}

async function cancelMatching(petId?: string): Promise<void> {
  if (isRunningInExpoGo()) return;
  const module = await notifications();
  const matches = (data: Record<string, unknown> | undefined) => data?.source === SOURCE && (petId === undefined || data.petId === petId);
  const scheduled = await module.getAllScheduledNotificationsAsync();
  for (const request of scheduled) {
    if (matches(request.content.data)) await module.cancelScheduledNotificationAsync(request.identifier);
  }
  const presented = await module.getPresentedNotificationsAsync();
  for (const notification of presented) {
    if (matches(notification.request.content.data)) await module.dismissNotificationAsync(notification.request.identifier);
  }
}

export async function cancelPetNotificationsForPet(petId: string): Promise<void> {
  if (!petId) return;
  petCancellationVersions.set(petId, (petCancellationVersions.get(petId) ?? 0) + 1);
  await cancelMatching(petId);
}

export async function cancelAllPetNotifications(): Promise<void> {
  allCancellationVersion += 1;
  await cancelMatching();
}
