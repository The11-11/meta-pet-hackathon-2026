import { applyApprovedMuseAction, parseMuseAction, type MuseAction } from './museActions.ts';
import type { AppData, ChatMessage, MuseConversation, MuseDecision } from './types';

const MAX_MESSAGES = 40;
const MAX_CHARACTERS = 40_000;
const validText = (value: unknown, limit: number): value is string => typeof value === 'string' && !!value.trim() && value.length <= limit;

export function emptyMuseConversation(petId: string): MuseConversation {
  return { petId, messages: [], decisions: {} };
}

function savedAction(data: AppData, action: MuseAction) {
  const id = `muse-${action.id}`;
  if (action.type === 'draft_social_post') return data.social?.posts.some(item => item.id === id) ?? false;
  return action.type === 'record_care' ? data.logs.some(log => log.id === id) : data.appointments.some(item => item.id === id);
}

// Project only known chat fields. An older app's saved care data remains usable
// without a conversation, and damaged chat fields cannot overwrite care records.
export function restoreMuseConversation(value: unknown, data: AppData): MuseConversation {
  const empty = emptyMuseConversation(data.pet.id);
  if (!value || typeof value !== 'object') return empty;
  const source = value as Record<string, unknown>;
  if (source.petId !== data.pet.id || !Array.isArray(source.messages)) return empty;
  const messages: ChatMessage[] = [];
  const ids = new Set<string>();
  let remaining = MAX_CHARACTERS;
  for (const raw of source.messages.slice(-MAX_MESSAGES).reverse()) {
    if (!raw || typeof raw !== 'object' || !validText(raw.id, 100) || ids.has(raw.id) || !['user', 'assistant'].includes(raw.role) || !validText(raw.content, 64 * 1024)) continue;
    const content = raw.content.slice(0, Math.min(10_000, remaining));
    if (!content.trim()) break;
    const actions: MuseAction[] = [];
    if (raw.role === 'assistant' && Array.isArray(raw.proposedActions)) for (const value of raw.proposedActions.slice(0, 3)) {
      try {
        const action = parseMuseAction(value);
        if (action.petId === data.pet.id && !actions.some(item => item.id === action.id)) actions.push(action);
      } catch { /* Skip malformed suggestions while preserving the conversation. */ }
    }
    messages.unshift({ id: raw.id, role: raw.role, content, ...(raw.mode === 'demo' || raw.mode === 'live' || raw.mode === 'local' ? { mode: raw.mode } : {}), ...(actions.length ? { proposedActions: actions } : {}) });
    ids.add(raw.id);
    remaining -= content.length;
    if (remaining <= 0) break;
  }
  const decisions: Record<string, MuseDecision> = {};
  const stored = source.decisions && typeof source.decisions === 'object' ? source.decisions as Record<string, unknown> : {};
  for (const message of messages) for (const action of message.proposedActions ?? []) {
    if (savedAction(data, action)) decisions[action.id] = 'saved';
    else if (Object.hasOwn(stored, action.id) && stored[action.id] === 'dismissed') decisions[action.id] = 'dismissed';
  }
  return { petId: data.pet.id, messages, decisions };
}

export function appendMuseMessage(data: AppData, message: ChatMessage): AppData {
  const previous = restoreMuseConversation(data.muse, data);
  return { ...data, muse: restoreMuseConversation({ ...previous, messages: [...previous.messages, message] }, data) };
}

function findAction(data: AppData, actionId: string) {
  const conversation = restoreMuseConversation(data.muse, data);
  const action = conversation.messages.flatMap(message => message.proposedActions ?? []).find(item => item.id === actionId);
  if (!action) throw new Error('This suggestion is no longer in this conversation. Ask Muse again.');
  return { conversation, action };
}

export function approveConversationAction(data: AppData, actionId: string, now = Date.now()): AppData {
  const { conversation, action } = findAction(data, actionId);
  if (conversation.decisions[actionId] === 'dismissed') throw new Error('This suggestion was dismissed. Ask Muse to prepare a new one.');
  const next = applyApprovedMuseAction(data, action, now);
  return { ...next, muse: { ...conversation, decisions: { ...conversation.decisions, [actionId]: 'saved' } } };
}

export function dismissConversationAction(data: AppData, actionId: string): AppData {
  const { conversation } = findAction(data, actionId);
  if (conversation.decisions[actionId] === 'saved') throw new Error('This entry has already been saved.');
  return { ...data, muse: { ...conversation, decisions: { ...conversation.decisions, [actionId]: 'dismissed' } } };
}

export function museHistory(messages: ChatMessage[], confirmedDecisions: Record<string, MuseDecision>): ChatMessage[] {
  return messages.map(message => {
    const results = (message.proposedActions ?? []).flatMap(action => {
      const decision = Object.hasOwn(confirmedDecisions, action.id) ? confirmedDecisions[action.id] : undefined;
      const label = action.type === 'record_care' ? action.payload.label : action.type === 'draft_social_post' ? `Social post draft for @${action.payload.petHandle}` : action.payload.title;
      return decision ? [`Owner decision: ${decision === 'saved' ? 'approved and saved locally' : 'dismissed without saving'} — ${label}.`] : [];
    });
    return results.length ? { ...message, content: `${message.content}\n${results.join('\n')}` } : message;
  });
}
