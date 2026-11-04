import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { MAX_SLIDESHOW_IMAGE_CHARS, MAX_SLIDESHOW_PHOTOS, type SlideshowPhoto } from './slideshowData';

class SlideshowPhotoPermissionError extends Error {}
export const slideshowPhotosNeedSettings = (failure: unknown) => failure instanceof SlideshowPhotoPermissionError;
export async function openSlideshowPhotoSettings() { if (Platform.OS !== 'web') await Linking.openSettings(); }

export async function prepareSlideshowPhoto(uri: string, width: number, height: number): Promise<SlideshowPhoto> {
  if (typeof uri !== 'string' || uri.length > 28_000_000 || !/^(data:image\/(?:jpeg|png|webp|heic|heif);base64,|file:|content:|ph:|blob:)/i.test(uri) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width * height > 50_000_000) throw new Error('Choose a smaller supported photo, up to 20 MB.');
  let compactUri = '';
  for (const size of [960, 720, 512]) {
    const context = ImageManipulator.manipulate(uri);
    try {
      if (Math.max(width, height) > size) context.resize(width >= height ? { width: size } : { height: size });
      const image = await context.renderAsync();
      try {
        const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.65, base64: true });
        const candidate = `data:image/jpeg;base64,${saved.base64 ?? ''}`;
        if (saved.base64 && candidate.length <= MAX_SLIDESHOW_IMAGE_CHARS) { compactUri = candidate; break; }
      } finally { image.release(); }
    } finally { context.release(); }
  }
  if (!compactUri) throw new Error('This photo is still too large. Try a closer crop or a smaller photo.');
  return { id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, uri: compactUri, tag: 'together', caption: '' };
}

export async function pickSlideshowPhotos(remaining: number): Promise<SlideshowPhoto[]> {
  if (!Number.isInteger(remaining) || remaining < 1 || remaining > MAX_SLIDESHOW_PHOTOS) throw new Error('Remove a photo before choosing another.');
  // The modern system picker selects only the photos the owner chooses. Launch
  // directly from their button gesture, including in the browser.
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 0.9, exif: false });
  } catch (failure) {
    const code = failure && typeof failure === 'object' && 'code' in failure ? failure.code : '';
    if (Platform.OS !== 'web' && typeof code === 'string' && /PERMISSION/i.test(code)) throw new SlideshowPhotoPermissionError('Photo access is blocked. Open phone settings to allow selected photos, then choose them again.');
    throw new Error('The photo picker could not open. Try again, or check photo access in your device settings.');
  }
  if (result.canceled || !result.assets?.length) return [];
  if (result.assets.length > remaining) throw new Error(`Choose up to ${remaining} more ${remaining === 1 ? 'photo' : 'photos'} for this slideshow.`);
  const photos: SlideshowPhoto[] = [];
  for (const asset of result.assets) {
    if (!asset.width || !asset.height || asset.width * asset.height > 50_000_000 || (asset.fileSize && asset.fileSize > 20 * 1024 * 1024)) throw new Error('Choose photos smaller than 20 MB each.');
    photos.push(await prepareSlideshowPhoto(asset.uri, asset.width, asset.height));
  }
  return photos;
}
