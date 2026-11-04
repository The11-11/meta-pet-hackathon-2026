import { isAuthDestination } from './authDestination.ts';
import type { MuseTransport } from './types';

// Match the public authentication address; no provider token reaches this client.
const PUBLIC_AUTH_BASE = (process.env.EXPO_PUBLIC_AUTH_URL?.trim() || 'http://localhost:8787').replace(/\/+$/, '');
export type FacebookTaggedPhoto = { id: string; caption: string; thumbnailUrl: string; width?: number; height?: number };
export class FacebookPhotosError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 0) { super(message); this.name = 'FacebookPhotosError'; this.code = code; this.status = status; }
}
const fail = () => new FacebookPhotosError('photos_invalid_response', 'Facebook photos could not be read. Please try browsing again.');
const validId = (id: unknown): id is string => typeof id === 'string' && /^\d{1,100}$/.test(id);
const validDimension = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 50000;
function safeThumbnail(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.searchParams.has('access_token') &&
      (url.hostname.endsWith('.fbcdn.net') || url.hostname.endsWith('.fbsbx.com') || url.hostname === 'lookaside.facebook.com');
  } catch { return false; }
}

async function requestPhotos(baseURL: string, transport: MuseTransport, path: string, body: object, signal?: AbortSignal) {
  if (!isAuthDestination(baseURL, PUBLIC_AUTH_BASE)) throw new FacebookPhotosError('photos_wrong_server', 'Use the configured Facebook connection before importing photos.');
  const owner = Object.entries(transport.headers ?? {}).find(([key]) => key.toLowerCase() === 'x-muse-owner')?.[1];
  if (!owner?.trim() || signal?.aborted) throw new FacebookPhotosError('photos_sign_in_required', signal?.aborted ? 'Photo import cancelled.' : 'Sign in with Facebook before importing tagged photos.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 30000);
  try {
    const response = await fetch(`${baseURL.replace(/\/+$/, '')}${path}`, { method: 'POST', credentials: transport.credentials ?? 'omit',
      headers: { ...transport.headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    const result = await response.json();
    if (!response.ok) {
      const code = typeof result?.errorCode === 'string' && /^photos_[a-z_]+$/.test(result.errorCode) ? result.errorCode : 'photos_unavailable';
      const message = typeof result?.error === 'string' && result.error.length <= 500 ? result.error : 'Facebook photos are unavailable. Please try again.';
      throw new FacebookPhotosError(code, message, response.status);
    }
    return result;
  } catch (error) {
    if (error instanceof FacebookPhotosError) throw error;
    throw new FacebookPhotosError('photos_unavailable', controller.signal.aborted ? 'Photo import stopped or timed out. Please try again.' : 'Facebook photos could not be reached. Check the connection and try again.');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export async function loadFacebookTaggedPhotos(baseURL: string, transport: MuseTransport, after?: string, signal?: AbortSignal): Promise<{ photos: FacebookTaggedPhoto[]; nextCursor?: string }> {
  if (after !== undefined && (typeof after !== 'string' || after.length > 2048 || !after.trim())) throw fail();
  const result = await requestPhotos(baseURL, transport, '/api/facebook/tagged-photos', after ? { after } : {}, signal);
  if (!Array.isArray(result?.photos) || result.photos.length > 20) throw fail();
  const photos = result.photos.map((entry: unknown): FacebookTaggedPhoto => {
    if (!entry || typeof entry !== 'object') throw fail();
    const item = entry as Record<string, unknown>;
    if (!validId(item.id) || !safeThumbnail(item.thumbnailUrl) || typeof item.caption !== 'string' || item.caption.length > 140 ||
      (item.width !== undefined && !validDimension(item.width)) || (item.height !== undefined && !validDimension(item.height))) throw fail();
    return { id: item.id, caption: item.caption, thumbnailUrl: item.thumbnailUrl, ...(validDimension(item.width) ? { width: item.width } : {}), ...(validDimension(item.height) ? { height: item.height } : {}) };
  });
  if (result.nextCursor !== undefined && (typeof result.nextCursor !== 'string' || !result.nextCursor.trim() || result.nextCursor.length > 2048)) throw fail();
  return { photos, ...(result.nextCursor ? { nextCursor: result.nextCursor as string } : {}) };
}

export async function importFacebookTaggedPhoto(baseURL: string, transport: MuseTransport, photoId: string, signal?: AbortSignal): Promise<{ dataUrl: string; width: number; height: number }> {
  if (!validId(photoId)) throw new FacebookPhotosError('photos_invalid_request', 'Choose a photo from the current Facebook list.');
  const result = await requestPhotos(baseURL, transport, '/api/facebook/tagged-photos/import', { photoId }, signal);
  if (typeof result?.dataUrl !== 'string' || result.dataUrl.length > 11_200_000 || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(result.dataUrl) ||
    !validDimension(result.width) || !validDimension(result.height) || result.width * result.height > 50_000_000) throw fail();
  return { dataUrl: result.dataUrl, width: result.width, height: result.height };
}
