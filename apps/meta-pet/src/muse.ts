import { isSlideshowRequest } from './slideshowIntent.ts';
import type { AppData, CareKind, ChatMessage, MuseTransport, SocialProfile } from './types';
import { parseMuseAction, type MuseAction } from './museActions.ts';
import { restoreSocialState } from './socialData.ts';

const MAX_CONTEXT_BYTES = 60 * 1_024;
const CARE_GOALS: CareKind[] = ['feeding', 'walk', 'training', 'sleep', 'vet'];

// A bound owner uses its verified session; preview tokens carry no owner identity.
function boundFacebookOwner(transport: MuseTransport) {
  return Object.entries(transport.headers ?? {}).some(([key, value]) => key.toLowerCase() === 'x-muse-owner' && value.trim().length > 0);
}

function previewAuthorization(token: string, transport: MuseTransport): Record<string, string> {
  return token.trim() && !boundFacebookOwner(transport) ? { Authorization: 'Bearer ' + token.trim() } : {};
}

function authorizationHelp(transport: MuseTransport) {
  return boundFacebookOwner(transport)
    ? 'Sign in with Facebook again to reconnect Muse. Your saved care entries are still on this device.'
    : 'This Muse connection needs its session token. Open Settings and test the connection to activate it.';
}

function utf8Bytes(value: string) {
  let bytes = 0;
  // Count code points without requiring a native TextEncoder implementation.
  for (const character of value) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function previewReply(message: string, data: AppData): string {
  const name = data.pet.name;
  const profile = [data.pet.species, data.pet.breed, data.pet.age].filter(Boolean).join(' · ');
  const needs = data.pet.careNeeds?.trim().slice(0, 500);
  const context = `${profile ? `Your saved profile: ${profile}. ` : ''}${needs ? `Your care preferences: ${needs}. ` : ''}`;
  const trainerSearch = /\b(trainers?|training classes?|puppy classes?|dog school|behavio[u]?rists?)\b/i.test(message);
  const shopping = /\b(shop|buy|marketplace|offers?|deals?|supplies|products?|toys?|beds?|harness|scratching|litter)\b/i.test(message);
  if (!shopping && !trainerSearch && /social|share|post|instagram|facebook|\btag\b|\bpage\b/i.test(message)) return `I can help create a page plan for ${name} or manage drafts for an existing Facebook or Instagram page. Open Social pages to save the name, @handle and bio, then ask me to draft a post. I include your pet’s @handle in every draft for review. Pages and posts are not published from this preview.`;
  const today = data.logs.filter(log => new Date(log.recordedAt).toDateString() === new Date().toDateString());
  if (/\b(vet|appointments?|health|temperature|heart|sick|pain|ill|vomit(?:ing)?|breath(?:ing)?|poison(?:ing)?|seizures?|collapse)\b/i.test(message)) {
    const next = data.appointments.filter(item => new Date(item.date).getTime() >= Date.now())
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    return `For ${name}'s vet, bring the care entries you have recorded and describe any changes you have observed.${next ? ` Your next recorded appointment is ${next.title}, ${new Date(next.date).toLocaleString()}.` : ' No upcoming vet appointment is recorded yet.'} There are no wearable readings connected here, so I cannot assess vital signs or diagnose a condition. If your pet seems unwell, contact your vet.`;
  }
  if (trainerSearch) return `For ${name}, open Find local dog trainers from Muse or the training entry screen. You can use the city Facebook shares or a managed Page’s area after granting access, or enter a general area yourself. Choose puppy basics, loose-leash walking or confidence support to compare nearby trainer searches. Ask about their reward-based methods, experience with your training goal and current availability. I have not verified individual trainers, reviews or prices, and Facebook city information is not live GPS.`;
  if (shopping) return `${context}Open Shop for pet-specific product ideas and Facebook Marketplace searches. Check size, materials, condition and suitability for ${name} with the seller before buying. Search links are not verified offers; I have not checked prices, stock or sellers. No purchase or Peta Coin payment is made.`;
  if (/collar|talk|listen|check.?in|audio|bark/i.test(message)) return `The companion collar is a product concept in this preview. A microphone captures audio; a speaker and network connection are also needed for two-way check-ins. No device is connected, and I am not listening to ${name} or translating barking. You can explore the collar setup screen.`;
  if (/walk|train|routine|plan|sleep|feed/i.test(message)) return `${context}For ${name}, keep the routine aligned with the care plan you already follow. Use short, reward-based practice and allow rest.${data.pet.species.toLowerCase() === 'cat' ? ' For a cat, consider short indoor play and access to scratching and hiding places.' : data.pet.species.toLowerCase() === 'dog' ? ' Match walks and enrichment to your dog’s age, comfort and usual activity.' : ' Tell me the species so I can suggest a suitable activity rather than assuming a dog or cat routine.'} Feeding amounts and exercise needs depend on age, body condition and health, so follow the food label and your vet’s guidance. Record what you offered and observed. Today’s log contains ${today.length} ${today.length === 1 ? 'entry' : 'entries'}; a missing entry does not prove an activity was missed. What would you like to work on first?`;
  if (/coin|reward|shop|buy|redeem/i.test(message)) return 'Peta Coin is a demo reward balance in this preview. You can try a local redemption in the concept shop; it does not purchase or deliver a product, transfer cryptocurrency, or pay on Facebook Marketplace.';
  return today.length
    ? `${name}'s care today: ${today.map(log => `${log.label}${log.note ? ` (${log.note})` : ''}`).join('; ')}. These are your recorded observations. I can help organize a routine or prepare notes for the vet. This reply comes from the local preview guide.`
    : `${context}There are no care entries recorded for ${name} today. Add a meal, walk, training session or rest note to start the timeline. I can then summarize what you recorded. This is the local preview guide; no wearable measurements are connected.`;
}

export function isSocialDraftRequest(message: string, history: ChatMessage[] = []): boolean {
  if (/\b(don['’]t|do not|never)\s+(draft|write|prepare|make|create|post|publish)\b/i.test(message)) return false;
  const platformChoice = /^(?:for\s+)?(facebook|instagram)(?:\s+please)?[.!]?$/i.exec(message.trim());
  const answeringDraftChoice = !!platformChoice && history.at(-1)?.role === 'assistant' && history.at(-1)?.content === 'Choose Facebook or Instagram for this draft so I use the right pet handle.';
  return /\b(draft|write|prepare|make|create)\b.*\b(post|caption|social update)\b/i.test(message) || /^(?:(?:please|can you|could you)\s+)?(?:post|publish)\b/i.test(message) || answeringDraftChoice;
}

function selectedSocialProfile(message: string, data: AppData): SocialProfile | undefined {
  const profiles = restoreSocialState(data.social).profiles;
  const facebook = /\bfacebook\b/i.test(message);
  const instagram = /\binstagram\b/i.test(message);
  if (facebook && instagram) return undefined;
  return facebook || instagram ? profiles.find(profile => profile.platform === (facebook ? 'facebook' : 'instagram')) : profiles.length === 1 ? profiles[0] : undefined;
}

const unsupportedSocialPlatform = (message: string) => /\b(tiktok|twitter|youtube|linkedin|snapchat|reddit)\b/i.test(message);

export function isLocalSocialDraftRequest(message: string, history: ChatMessage[] = [], data?: AppData): boolean {
  return isSocialDraftRequest(message, history) && (!data?.backendUrl || unsupportedSocialPlatform(message) || !selectedSocialProfile(message, data));
}

export async function requestMuse(message: string, data: AppData, history: ChatMessage[], token: string, transport: MuseTransport = {}) {
  let socialProfile: SocialProfile | undefined;
  if (isSlideshowRequest(message)) return { reply: `Let’s make a memory slideshow with you and ${data.pet.name}. Choose the photos, add your tags and captions, then preview with music before downloading. Your photos stay in the local studio.`, mode: 'local' as const, proposedActions: [] as MuseAction[], localDestination: '/slideshow' as const };
  if (isSocialDraftRequest(message, history)) {
    if (unsupportedSocialPlatform(message)) return { reply: 'Social page drafts currently support Facebook and Instagram. Choose one of those platforms for your pet’s draft.', mode: 'demo' as const, proposedActions: [] as MuseAction[] };
    const profiles = restoreSocialState(data.social).profiles;
    const profile = selectedSocialProfile(message, data);
    if (!profile) return { reply: profiles.length ? 'Choose Facebook or Instagram for this draft so I use the right pet handle.' : `First, open Social pages to prepare a page for ${data.pet.name} or add an existing page’s @handle. I’ll then include that handle in every post draft.`, mode: 'demo' as const, proposedActions: [] as MuseAction[] };
    if (!data.backendUrl) {
      const now = Date.now();
      const action = parseMuseAction({ id: `local-social-${now}-${Math.random().toString(36).slice(2, 9)}`, petId: data.pet.id, expiresAt: new Date(now + 15 * 60_000).toISOString(), type: 'draft_social_post', payload: { profileId: profile.id, platform: profile.platform, petHandle: profile.handle, caption: `Meet ${data.pet.name} 🐾 A little personality, a lot of love. Follow along for everyday moments.`, note: 'Local demo caption. Edit the draft in Social pages before sharing.' } });
      return { reply: 'Here is a starter post from the local demo guide. Review the caption and your pet’s @handle, then approve to save a draft. Nothing will be published.', mode: 'demo' as const, proposedActions: [action] };
    }
    socialProfile = profile;
  }
  if (!data.backendUrl) {
    const match = /^record (feeding|walk|training|sleep|vet):\s*(.{1,120})$/i.exec(message);
    const now = Date.now();
    const proposedActions: MuseAction[] = match ? [parseMuseAction({ id: `local-${now}-${Math.random().toString(36).slice(2)}`, petId: data.pet.id, expiresAt: new Date(now + 15 * 60_000).toISOString(), type: 'record_care', payload: { kind: match[1].toLowerCase(), label: match[2], note: '', recordedAt: new Date(now).toISOString() } })] : [];
    return { reply: proposedActions.length ? 'Review this care entry. It will only be saved on this device when you approve it.' : previewReply(message, data), mode: 'demo' as const, proposedActions };
  }
  const recentHistory: { role: 'user' | 'assistant'; content: string }[] = [];
  let remainingCharacters = 9_000;
  // Keep other social drafts and their handles out of subsequent care requests.
  const modelHistory = history.filter(item => item.mode !== 'local' && !(item.role === 'user' && isSlideshowRequest(item.content)) && !item.proposedActions?.some(action => action.type === 'draft_social_post') && !(item.role === 'user' && isSocialDraftRequest(item.content)));
  for (const item of (socialProfile ? [] : modelHistory).slice(-12).reverse()) {
    const content = item.content.slice(0, Math.min(3_000, remainingCharacters));
    if (!content.trim()) continue;
    recentHistory.unshift({ role: item.role, content });
    remainingCharacters -= content.length;
    if (!remainingCharacters) break;
  }
  const logs = socialProfile ? [] : data.logs.slice(0, 50);
  const appointments = (socialProfile ? [] : data.appointments).filter(item => new Date(item.date).getTime() >= Date.now())
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 20);
  // The avatar stays on-device; text chat does not resend portrait pixels.
  const { id, name, species } = data.pet;
  const breed = data.pet.breed?.trim().slice(0, 100) ?? '';
  const age = data.pet.age?.trim().slice(0, 80) ?? '';
  const careNeeds = data.pet.careNeeds?.trim().slice(0, 500);
  const careGoals = [...new Set(data.onboarding?.goals ?? [])].filter(goal => CARE_GOALS.includes(goal)).slice(0, 5);
  // The owner authorized these selected-page fields for live post drafting.
  // Public page URLs, other pages, saved drafts and care history stay out.
  const context = { message, pet: socialProfile ? { id, name, species } : { id, name, species, breed, age, ...(careNeeds ? { careNeeds } : {}) }, logs, appointments, history: recentHistory,
    ...(!socialProfile ? { careGoals } : {}),
    ...(socialProfile ? { taskPurpose: 'social_draft', socialProfiles: [{ id: socialProfile.id, platform: socialProfile.platform, displayName: socialProfile.displayName, handle: socialProfile.handle, bio: socialProfile.bio }] } : {}) };
  let body = JSON.stringify(context);
  // Leave headroom below the server's 64 KiB limit, including multibyte notes.
  // Keep the question and pet intact; retain the freshest care context first.
  while (utf8Bytes(body) > MAX_CONTEXT_BYTES) {
    if (recentHistory.length) recentHistory.shift();
    else if (logs.length) logs.pop();
    else if (appointments.length) appointments.pop();
    else throw new Error('This message and pet profile are too large. Shorten them and try again.');
    body = JSON.stringify(context);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(`${data.backendUrl}/api/muse/chat`, {
      method: 'POST', signal: controller.signal, credentials: transport.credentials ?? 'omit',
      headers: { 'Content-Type': 'application/json', ...(transport.headers ?? {}), ...previewAuthorization(token, transport) },
      body,
    });
    if (!response.ok) {
      let reason = '';
      try {
        const failure = await response.json();
        if (typeof failure.error === 'string' && failure.error.trim() && failure.error.length <= 300) reason = failure.error;
      } catch { /* A failed connection may return no structured error. */ }
      throw new Error(response.status === 401 ? authorizationHelp(transport) : reason || 'Muse could not complete that request. Check the connection in Settings or try again.');
    }
    const result = await response.json();
    if (typeof result.reply !== 'string' || !['demo', 'live'].includes(result.mode)) throw new Error('The Muse connection returned an unexpected response.');
    if (result.proposedActions !== undefined && (!Array.isArray(result.proposedActions) || result.proposedActions.length > 3)) throw new Error('Muse returned invalid suggestions.');
    const proposedActions = (result.proposedActions ?? []).map(parseMuseAction) as MuseAction[];
    if (socialProfile && (!proposedActions.length || proposedActions.some(action => action.petId !== data.pet.id || action.type !== 'draft_social_post' || action.payload.profileId !== socialProfile.id || action.payload.platform !== socialProfile.platform || action.payload.petHandle !== socialProfile.handle))) throw new Error('Muse did not prepare a draft for your selected pet page. Try asking for a post again.');
    return { reply: result.reply as string, mode: result.mode as 'demo' | 'live', proposedActions, ...(!socialProfile && result.memory?.enabled === true ? { memorySaved: result.memory.saved === true } : {}) };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Muse took too long to respond. Your care entries are still saved.');
    if (error instanceof TypeError) throw new Error('Could not reach Muse. Check the connection address in Settings.');
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function testMuseConnection(url: string, token: string, transport: MuseTransport = {}): Promise<{ verified: boolean; message: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${url.trim().replace(/\/+$/, '')}/api/muse/check`, {
      method: 'POST', signal: controller.signal, credentials: transport.credentials ?? 'omit',
      headers: { 'Content-Type': 'application/json', ...(transport.headers ?? {}), ...previewAuthorization(token, transport) }, body: '{}',
    });
    const result = await response.json();
    if (!response.ok) throw new Error(response.status === 401 && boundFacebookOwner(transport) ? authorizationHelp(transport) : typeof result.error === 'string' ? result.error : 'Muse could not verify this connection.');
    if (typeof result.verified !== 'boolean' || typeof result.message !== 'string') throw new Error('This server does not support the Muse connection check.');
    return { verified: result.verified, message: result.message };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Muse took too long to respond. Try again.');
    if (error instanceof TypeError) throw new Error('Could not reach Muse. Check the server address and whether it is running.');
    throw error;
  } finally { clearTimeout(timeout); }
}
