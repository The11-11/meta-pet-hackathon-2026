import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { parsePetAvatar } from './petAvatarData';
import type { PetAvatar, PetPhoto } from './types';

class PetPhotoPermissionError extends Error {
  readonly openSettings: boolean;
  constructor(source: 'camera' | 'library', canAskAgain: boolean) {
    super(!canAskAgain
      ? source === 'camera' ? 'Camera access is blocked. Open phone settings to allow it, or choose a photo instead.' : 'Photo access is blocked. Open phone settings to allow it, then choose your pet photo again.'
      : 'Allow camera access to take a pet photo, or choose a photo instead.');
    this.name = 'PetPhotoPermissionError';
    this.openSettings = !canAskAgain;
  }
}

export function petPhotoNeedsSettings(failure: unknown): boolean {
  return Platform.OS !== 'web' && failure instanceof PetPhotoPermissionError && failure.openSettings;
}

/** Only the owner's Settings button opens the operating system settings. */
export async function openPetPhotoSettings(): Promise<void> {
  if (Platform.OS !== 'web') await Linking.openSettings();
}

export async function pickPetPhoto(source: 'camera' | 'library'): Promise<PetPhoto | null> {
  // On web the picker must launch directly from the owner's button gesture.
  if (source === 'camera' && Platform.OS !== 'web') {
    let permission = await ImagePicker.getCameraPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new PetPhotoPermissionError(source, permission.canAskAgain);
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.9, exif: false };
  let result: ImagePicker.ImagePickerResult;
  try {
    // Modern system photo pickers do not need broad photo-library permission.
    result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  } catch (failure) {
    const code = failure && typeof failure === 'object' && 'code' in failure ? failure.code : '';
    if (Platform.OS !== 'web' && typeof code === 'string' && /PERMISSION/i.test(code)) {
      const permission = source === 'camera' ? await ImagePicker.getCameraPermissionsAsync() : await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!permission.granted && !permission.canAskAgain) throw new PetPhotoPermissionError(source, false);
    }
    throw failure;
  }
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  if (!asset.width || !asset.height || asset.width * asset.height > 50_000_000 || (asset.fileSize && asset.fileSize > 20 * 1024 * 1024)) throw new Error('Choose a smaller pet photo, up to 20 MB.');
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > 1024) context.resize(asset.width >= asset.height ? { width: 1024 } : { height: 1024 });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64 || saved.base64.length > 2_750_000) throw new Error('That photo is too large. Try a closer crop or a smaller photo.');
  return { uri: saved.uri, mimeType: 'image/jpeg', base64: saved.base64 };
}

export async function compactPetAvatar(image: { uri: string; createdAt: string }): Promise<PetAvatar> {
  // Keep the saved portrait below Android's per-record storage window.
  for (const width of [512, 384]) {
    const context = ImageManipulator.manipulate(image.uri);
    context.resize({ width });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.PNG, base64: true });
    const avatar = parsePetAvatar({ uri: `data:image/png;base64,${saved.base64 ?? ''}`, createdAt: image.createdAt, style: 'muse-plush' });
    if (avatar) return avatar;
  }
  throw new Error('The avatar could not be saved at a suitable size. Please try creating it again.');
}
