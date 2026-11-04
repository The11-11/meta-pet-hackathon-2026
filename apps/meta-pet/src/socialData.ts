import type { AppData, PetSocialState, SocialPlatform, SocialPost, SocialProfile } from './types';

export const socialPlatformLabels = { facebook: 'Facebook', instagram: 'Instagram' } as const;
const text = (value: unknown, max: number, empty = false): value is string => typeof value === 'string' && value.length <= max && (empty || !!value.trim());
const validDate = (value: unknown): value is string => text(value, 60) && /T.*(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const platform = (value: unknown): value is SocialPlatform => value === 'facebook' || value === 'instagram';

export function normalizePetHandle(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Enter your pet’s social handle.');
  const handle = value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_][a-z0-9._]{0,49}$/.test(handle)) throw new Error('Use up to 50 letters, numbers, dots or underscores for the handle.');
  return handle;
}

export function withPetMention(value: string, valueHandle: string): string {
  if (!text(value, 1800)) throw new Error('Write a caption of up to 1,800 characters.');
  const handle = normalizePetHandle(valueHandle);
  const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mentioned = new RegExp(`(^|[^A-Za-z0-9_.@])@${escaped}(?![A-Za-z0-9_.])`, 'i').test(value);
  const caption = mentioned ? value.trim() : `${value.trim()}\n\n@${handle}`;
  if (caption.length > 1800) throw new Error('Shorten the caption to leave room for your pet’s @handle.');
  return caption;
}

function publicPageUrl(value: unknown, service: SocialPlatform): string {
  if (!text(value, 500, true)) throw new Error('Enter a public page address of up to 500 characters.');
  const input = value.trim();
  if (!input) return '';
  try {
    const url = new URL(input);
    const domain = `${service}.com`;
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !(url.hostname === domain || url.hostname.endsWith(`.${domain}`))) throw new Error();
    return url.toString();
  } catch { throw new Error(`Use a public https://${service}.com page address.`); }
}

function profileDetails(value: unknown): Omit<SocialProfile, 'id' | 'createdAt'> {
  if (!value || typeof value !== 'object') throw new Error('Check your social page details.');
  const item = value as Record<string, unknown>;
  if (!platform(item.platform) || !text(item.displayName, 80) || !text(item.bio, 500, true) || !['create', 'manage'].includes(item.intent as string)) throw new Error('Check your social page name and bio.');
  return { platform: item.platform, displayName: item.displayName.trim(), handle: normalizePetHandle(item.handle), bio: item.bio.trim(), intent: item.intent as 'create' | 'manage', url: publicPageUrl(item.url, item.platform) };
}

export function restoreSocialState(value: unknown): PetSocialState {
  const result: PetSocialState = { profiles: [], posts: [] };
  if (!value || typeof value !== 'object') return result;
  const stored = value as Record<string, unknown>;
  for (const raw of Array.isArray(stored.profiles) ? stored.profiles.slice(0, 10) : []) {
    try {
      if (!raw || !text(raw.id, 100) || !validDate(raw.createdAt)) continue;
      const details = profileDetails(raw);
      if (result.profiles.some(item => item.id === raw.id || item.platform === details.platform)) continue;
      result.profiles.push({ ...details, id: raw.id, createdAt: raw.createdAt });
    } catch { /* A damaged social profile cannot replace the care history. */ }
  }
  for (const raw of Array.isArray(stored.posts) ? stored.posts.slice(0, 50) : []) {
    try {
      if (!raw || !text(raw.id, 100) || !text(raw.profileId, 100) || !platform(raw.platform) || !text(raw.note, 1000, true) || !validDate(raw.createdAt) || result.posts.some(item => item.id === raw.id)) continue;
      const petHandle = normalizePetHandle(raw.petHandle);
      if (!result.profiles.some(item => item.id === raw.profileId && item.platform === raw.platform && item.handle === petHandle)) continue;
      result.posts.push({ id: raw.id, profileId: raw.profileId, platform: raw.platform, petHandle, caption: withPetMention(raw.caption, petHandle), note: raw.note, createdAt: raw.createdAt });
    } catch { /* Keep usable drafts if another saved item is malformed. */ }
  }
  return result;
}

export function saveSocialProfileData(data: AppData, input: Omit<SocialProfile, 'id' | 'createdAt'>, profileId?: string, now = Date.now()): AppData {
  const social = restoreSocialState(data.social);
  const details = profileDetails(input);
  const previous = profileId ? social.profiles.find(item => item.id === profileId) : social.profiles.find(item => item.platform === details.platform);
  if (profileId && !previous) throw new Error('This page has changed. Open its details again.');
  if (previous && previous.platform !== details.platform) throw new Error('Keep this page’s platform, or prepare a separate page for the other platform.');
  if (social.profiles.some(item => item.platform === details.platform && item.id !== previous?.id)) throw new Error('Edit your saved page for this platform.');
  const profile: SocialProfile = { ...details, id: previous?.id ?? `social-${now}-${Math.random().toString(36).slice(2, 9)}`, createdAt: previous?.createdAt ?? new Date(now).toISOString() };
  const posts = social.posts.map(post => {
    if (!previous || post.profileId !== previous.id || post.petHandle === profile.handle) return post;
    const escaped = post.petHandle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const caption = post.caption.replace(new RegExp(`(^|[^A-Za-z0-9_.@])@${escaped}(?![A-Za-z0-9_.])`, 'gi'), (_match, prefix: string) => `${prefix}@${profile.handle}`);
    return { ...post, petHandle: profile.handle, caption: withPetMention(caption, profile.handle) };
  });
  return { ...data, social: { posts, profiles: [...social.profiles.filter(item => item.id !== profile.id), profile] } };
}

export function updateSocialPostData(data: AppData, id: string, caption: string): AppData {
  const social = restoreSocialState(data.social);
  const post = social.posts.find(item => item.id === id);
  if (!post) throw new Error('This draft is no longer available. Ask Muse for a new one.');
  return { ...data, social: { ...social, posts: social.posts.map(item => item.id === id ? { ...item, caption: withPetMention(caption, post.petHandle) } : item) } };
}

export function prepareSocialPostData(data: AppData, post: Omit<SocialPost, 'createdAt'>, now = Date.now()): AppData {
  const social = restoreSocialState(data.social);
  if (social.posts.some(item => item.id === post.id)) return data;
  const profile = social.profiles.find(item => item.id === post.profileId && item.platform === post.platform && item.handle === normalizePetHandle(post.petHandle));
  if (!profile) throw new Error('The pet’s social page changed. Ask Muse to prepare a fresh draft.');
  if (social.posts.length >= 50) throw new Error('You have 50 saved drafts. Edit an existing draft for now.');
  return { ...data, social: { ...social, posts: [{ ...post, petHandle: profile.handle, caption: withPetMention(post.caption, profile.handle), createdAt: new Date(now).toISOString() }, ...social.posts] } };
}
