export type MusePageMemory = { available: true; exists: boolean; updatedAt: string | null; markdown: string };
export const MAX_MUSE_MEMORY_BYTES = 16 * 1024;

function boundedMarkdown(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_MUSE_MEMORY_BYTES) return false;
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > MAX_MUSE_MEMORY_BYTES) return false;
  }
  return true;
}

export function parseMusePageMemory(value: unknown): MusePageMemory | null {
  if (!value || typeof value !== 'object') return null;
  const memory = value as Record<string, unknown>;
  if (memory.available !== true || typeof memory.exists !== 'boolean' || !boundedMarkdown(memory.markdown)) return null;
  if (memory.updatedAt !== null && (typeof memory.updatedAt !== 'string' || memory.updatedAt.length > 40 || !Number.isFinite(Date.parse(memory.updatedAt)))) return null;
  return { available: true, exists: memory.exists, updatedAt: memory.exists ? memory.updatedAt as string | null : null, markdown: memory.exists ? memory.markdown : '' };
}

export function validMemoryPageId(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= 100;
}
