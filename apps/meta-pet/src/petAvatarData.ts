import type { PetAvatar } from './types';

// Store a compact, self-contained image; never restore a remote tracking URL.
export function parsePetAvatar(value: unknown): PetAvatar | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const avatar = value as Record<string, unknown>;
  if (avatar.style !== 'muse-plush' || typeof avatar.createdAt !== 'string' || !Number.isFinite(Date.parse(avatar.createdAt)) ||
    typeof avatar.uri !== 'string' || avatar.uri.length > 1_000_000 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar.uri)) return undefined;
  return { uri: avatar.uri, createdAt: avatar.createdAt, style: 'muse-plush' };
}
