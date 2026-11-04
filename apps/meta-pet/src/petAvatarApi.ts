import type { MuseTransport, PetPhoto, PetProfile } from './types';

export async function requestPetAvatar(url: string, photo: PetPhoto, pet: PetProfile, token: string, transport: MuseTransport = {}): Promise<{ uri: string; createdAt: string }> {
  if (!url) throw new Error('Connect Muse in Settings before creating your pet’s avatar.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 130_000);
  try {
    const response = await fetch(`${url.replace(/\/+$/, '')}/api/muse/avatar`, {
      method: 'POST', signal: controller.signal, credentials: transport.credentials ?? 'omit',
      headers: { 'Content-Type': 'application/json', ...(transport.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ pet: { id: pet.id, name: pet.name.trim(), species: pet.species }, photo: { mimeType: photo.mimeType, base64: photo.base64 } }),
    });
    const result = await response.json();
    if (response.status === 401 || response.status === 403) throw new Error('Sign in to create your custom avatar, or continue without one for now.');
    if (response.status === 503) throw new Error('Muse avatar creation is unavailable right now. Your photo is still here; please try again later.');
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Muse could not create your avatar. Please try again.');
    if (result.mode !== 'live' || result.petId !== pet.id || typeof result.generatedAt !== 'string' || !Number.isFinite(Date.parse(result.generatedAt)) ||
      typeof result.image?.dataUrl !== 'string' || result.image.dataUrl.length > 12_000_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(result.image.dataUrl)) {
      throw new Error('Muse returned an unexpected avatar. Please try again.');
    }
    return { uri: result.image.dataUrl, createdAt: result.generatedAt };
  } catch (failure) {
    if (failure instanceof Error && failure.name === 'AbortError') throw new Error('Your avatar took too long to create. Your photo is still here; please try again.');
    if (failure instanceof TypeError) throw new Error('Could not reach Muse. Check your connection and try again.');
    throw failure;
  } finally { clearTimeout(timeout); }
}
