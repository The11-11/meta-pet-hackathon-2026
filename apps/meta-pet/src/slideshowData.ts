export const MAX_SLIDESHOW_PHOTOS = 8;
export const MAX_SLIDESHOW_IMAGE_CHARS = 220_000;
export const MAX_SLIDESHOW_STORAGE_CHARS = 1_800_000;
export const SLIDESHOW_TAGS = ['person', 'pet', 'together'] as const;
export type SlideshowTag = typeof SLIDESHOW_TAGS[number];
export type SlideshowPhoto = { id: string; uri: string; tag: SlideshowTag; caption: string };
export type SlideshowDraft = { schema: 1; title: string; photos: SlideshowPhoto[]; secondsPerSlide: 3 | 4 | 5 | 6 };

type OwnerScope = { id: string; mode: 'facebook' | 'demo' };
type SlideshowStorage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> };
const pendingWrites = new Map<string, Promise<void>>();
const validText = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length <= limit;

export function slideshowStorageKey(owner: OwnerScope | null, petId: string): string | null {
  if (!owner || !['facebook', 'demo'].includes(owner.mode) || !validText(owner.id, 200) || !owner.id.trim() || !validText(petId, 100) || !petId.trim()) return null;
  return `muse.pet.slideshow.v1.${encodeURIComponent(JSON.stringify([owner.mode, owner.id, petId]))}`;
}

export function emptySlideshow(petName: string): SlideshowDraft {
  return { schema: 1, title: `Our moments with ${petName}`.slice(0, 80), photos: [], secondsPerSlide: 4 };
}

export function parseSlideshowPhoto(value: unknown): SlideshowPhoto | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (!validText(item.id, 100) || !item.id.trim() || !validText(item.uri, MAX_SLIDESHOW_IMAGE_CHARS) ||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(item.uri) || !SLIDESHOW_TAGS.includes(item.tag as SlideshowTag) || !validText(item.caption, 140)) return null;
  return { id: item.id, uri: item.uri, tag: item.tag as SlideshowTag, caption: item.caption };
}

export function parseSlideshowDraft(value: unknown): SlideshowDraft | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (item.schema !== 1 || !validText(item.title, 80) || !item.title.trim() || ![3, 4, 5, 6].includes(item.secondsPerSlide as number) || !Array.isArray(item.photos) || item.photos.length > MAX_SLIDESHOW_PHOTOS) return null;
  const photos: SlideshowPhoto[] = [];
  for (const entry of item.photos) {
    const photo = parseSlideshowPhoto(entry);
    if (!photo || photos.some(previous => previous.id === photo.id)) return null;
    photos.push(photo);
  }
  const result: SlideshowDraft = { schema: 1, title: item.title, photos, secondsPerSlide: item.secondsPerSlide as SlideshowDraft['secondsPerSlide'] };
  return JSON.stringify(result).length <= MAX_SLIDESHOW_STORAGE_CHARS ? result : null;
}

export function moveSlideshowPhoto(draft: SlideshowDraft, id: string, direction: -1 | 1): SlideshowDraft {
  const index = draft.photos.findIndex(photo => photo.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= draft.photos.length) return draft;
  const photos = [...draft.photos];
  [photos[index], photos[next]] = [photos[next], photos[index]];
  return { ...draft, photos };
}

export async function loadSlideshowDraft(storage: SlideshowStorage, key: string, fallback: SlideshowDraft): Promise<SlideshowDraft> {
  await pendingWrites.get(key)?.catch(() => {});
  const raw = await storage.getItem(key);
  if (!raw) return fallback;
  if (raw.length > MAX_SLIDESHOW_STORAGE_CHARS) throw new Error('The saved slideshow is too large. Choose the photos again to start a smaller slideshow.');
  let draft: SlideshowDraft | null;
  try { draft = parseSlideshowDraft(JSON.parse(raw)); } catch { draft = null; }
  if (!draft) throw new Error('This saved slideshow could not be opened. Choose your photos again to make a new one.');
  return draft;
}

export async function saveSlideshowDraft(storage: SlideshowStorage, key: string, value: SlideshowDraft, stillActive: () => boolean): Promise<void> {
  const draft = parseSlideshowDraft(value);
  if (!draft) throw new Error('Check the title and photos before saving this slideshow.');
  const encoded = JSON.stringify(draft);
  const write = (pendingWrites.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
    if (!stillActive()) throw new Error('Your pet page changed. Reopen the slideshow before saving.');
    await storage.setItem(key, encoded);
  });
  pendingWrites.set(key, write);
  try { await write; } finally { if (pendingWrites.get(key) === write) pendingWrites.delete(key); }
}

export async function clearSlideshowDraft(storage: { removeItem: (key: string) => Promise<void> }, key: string, stillActive: () => boolean): Promise<void> {
  // Delete after any earlier save so an in-flight write cannot restore photos
  // after the owner has explicitly reset this pet's saved local data.
  const clear = (pendingWrites.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
    if (!stillActive()) throw new Error('Your pet page changed. Reopen the current pet before clearing saved photos.');
    await storage.removeItem(key);
    if (!stillActive()) throw new Error('Your pet page changed while clearing its saved photos.');
  });
  pendingWrites.set(key, clear);
  try { await clear; } finally { if (pendingWrites.get(key) === clear) pendingWrites.delete(key); }
}
