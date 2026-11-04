export type FacebookLocationSource = 'profile' | 'pages';
export type TrainerLocation = { id: string; source: 'facebook_profile' | 'facebook_page'; label: string; area: string };
export type FacebookLocationResult = { status: 'available' | 'permission_required' | 'no_location' | 'unavailable'; locations: TrainerLocation[] };

export const trainerGoals = [
  { id: 'puppy', label: 'Puppy basics', type: 'Reward-based puppy trainer', why: 'For first cues, settling and everyday routines, look for a trainer who works with puppies and builds skills in small steps.', search: 'reward based puppy dog training' },
  { id: 'walks', label: 'Calmer walks', type: 'Loose-leash walking trainer', why: 'For pulling and busy walks, look for coaching that helps both you and your dog practise calm, manageable walks.', search: 'reward based loose leash dog trainer' },
  { id: 'confidence', label: 'Confidence & behaviour', type: 'Qualified behaviour-focused trainer', why: 'For confidence and behaviour goals, look for an experienced professional who explains their qualifications and adapts sessions to your dog.', search: 'qualified reward based dog behaviour trainer' },
] as const;
export type TrainerGoal = typeof trainerGoals[number]['id'];

export function trainerArea(value: unknown): string {
  if (typeof value !== 'string' || value.length > 100 || /[\u0000-\u001f\u007f]/.test(value)) return '';
  return value.trim().replace(/\s+/g, ' ');
}

export function parseFacebookLocations(value: unknown, source: FacebookLocationSource): FacebookLocationResult {
  const empty: FacebookLocationResult = { status: 'unavailable', locations: [] };
  if (!value || typeof value !== 'object') return empty;
  const result = value as Record<string, unknown>;
  if (typeof result.status !== 'string' || !['available', 'permission_required', 'no_location', 'unavailable'].includes(result.status)) return empty;
  if (result.status !== 'available') return { status: result.status as FacebookLocationResult['status'], locations: [] };
  if (!Array.isArray(result.locations)) return empty;
  const expected = source === 'profile' ? 'facebook_profile' : 'facebook_page';
  const seen = new Set<string>();
  const locations: TrainerLocation[] = [];
  for (const item of result.locations.slice(0, 50)) {
    if (!item || typeof item !== 'object') continue;
    const location = item as Record<string, unknown>;
    const area = trainerArea(location.area);
    if (location.source !== expected || typeof location.id !== 'string' || !location.id.trim() || location.id.length > 200 || typeof location.label !== 'string' || !location.label.trim() || location.label.length > 100 || !area || seen.has(location.id)) continue;
    seen.add(location.id);
    locations.push({ id: location.id, source: expected, label: location.label.trim(), area });
  }
  return { status: locations.length ? 'available' : 'no_location', locations };
}

export function trainerSearchLinks(areaInput: string, goal: TrainerGoal) {
  const area = trainerArea(areaInput);
  const match = trainerGoals.find(item => item.id === goal);
  if (!area || !match) return null;
  const query = match.search + ' ' + area;
  return {
    query,
    maps: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query),
    facebook: 'https://www.facebook.com/search/pages/?q=' + encodeURIComponent(query),
  };
}
