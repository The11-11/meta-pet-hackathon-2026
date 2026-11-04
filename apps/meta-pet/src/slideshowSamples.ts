import { Asset } from 'expo-asset';
import { Platform } from 'react-native';
import { MAX_SLIDESHOW_PHOTOS, type SlideshowPhoto } from './slideshowData';
import { prepareSlideshowPhoto } from './slideshowPhotos';

const samples = [
  { source: require('../assets/muse-dog.png'), caption: 'Sample artwork · Meet Muse Dog' },
  { source: require('../assets/products/meta-collar-v1.png'), caption: 'Sample artwork · Collar concept' },
];

function checkActive(signal?: AbortSignal) { if (signal?.aborted) throw new Error('Sample story loading cancelled.'); }

async function bundledPhotoUri(asset: Asset, signal?: AbortSignal): Promise<string> {
  checkActive(signal);
  if (Platform.OS !== 'web') {
    await asset.downloadAsync();
    checkActive(signal);
    if (!asset.localUri) throw new Error('The sample artwork could not load. Please try again.');
    return asset.localUri;
  }
  const url = new URL(asset.uri, window.location.href);
  if (url.origin !== window.location.origin || url.username || url.password || !/^\/(?:assets\/|_expo\/static\/)/.test(url.pathname)) throw new Error('The bundled sample artwork is unavailable here.');
  const response = await fetch(url.toString(), { credentials: 'omit', redirect: 'error', signal });
  if (!response.ok) throw new Error('The sample artwork could not load. Please try again.');
  const blob = await response.blob();
  if (!blob.size || blob.size > 20 * 1024 * 1024) throw new Error('The sample artwork could not be opened.');
  const uri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The sample artwork could not be opened.'));
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The sample artwork could not be opened.'));
    reader.readAsDataURL(blob);
  });
  checkActive(signal);
  return uri;
}

/** Explicit sample-story action; only already bundled public project artwork. */
export async function loadSlideshowSamples(remaining: number, signal?: AbortSignal): Promise<SlideshowPhoto[]> {
  if (!Number.isInteger(remaining) || remaining < 1 || remaining > MAX_SLIDESHOW_PHOTOS) throw new Error('Remove a photo before trying the sample story.');
  const photos: SlideshowPhoto[] = [];
  for (const sample of samples.slice(0, remaining)) {
    checkActive(signal);
    const asset = Asset.fromModule(sample.source);
    if (!asset.width || !asset.height) throw new Error('The sample artwork could not be identified.');
    const uri = await bundledPhotoUri(asset, signal);
    const photo = await prepareSlideshowPhoto(uri, asset.width, asset.height);
    checkActive(signal);
    photos.push({ ...photo, tag: 'pet', caption: sample.caption });
  }
  return photos;
}
