import type { AppData } from './types';

export function museGuideProgress(data: Pick<AppData, 'logs' | 'appointments'>, now = Date.now()) {
  return {
    hasCareEntry: data.logs.length > 0,
    savedCareCount: data.logs.length,
    upcomingAppointments: data.appointments.filter(item => Number.isFinite(Date.parse(item.date)) && Date.parse(item.date) >= now).length,
  };
}

/** A single non-throwing contract drives both the review button and submission. */
export function careReviewDraft(kind: 'feeding' | 'walk', description: string): { request: string | null; error: string } {
  if (kind !== 'feeding' && kind !== 'walk') return { request: null, error: 'Choose a meal or walk.' };
  const label = typeof description === 'string' ? description.trim().replace(/\s+/g, ' ') : '';
  if (!label || label.length > 120) return { request: null, error: 'Describe the real meal or walk in 1–120 characters.' };
  return { request: 'record ' + kind + ': ' + label, error: '' };
}

/** Only an owner's description becomes a proposal; the existing approval flow saves it. */
export function careReviewRequest(kind: 'feeding' | 'walk', description: string) {
  const draft = careReviewDraft(kind, description);
  if (!draft.request) throw new Error(draft.error);
  return draft.request;
}

export async function submitCareReview(kind: 'feeding' | 'walk', description: string, ask: (request: string) => Promise<void>): Promise<string> {
  const draft = careReviewDraft(kind, description);
  if (!draft.request) return draft.error;
  try { await ask(draft.request); return ''; }
  catch { return 'Muse could not prepare this review. Please try again.'; }
}
