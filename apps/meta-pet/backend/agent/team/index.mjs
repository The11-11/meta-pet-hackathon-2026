import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8').trim();
const manifest = JSON.parse(read('./manifest.json'));
const ids = new Set();
const capabilities = new Set(['care_guidance', 'owner_review_proposals', 'nutrition_guidance', 'routine_guidance', 'training_guidance', 'vet_question_preparation', 'product_search_guidance', 'social_draft_guidance', 'read_only_project_advice', 'source_comparison', 'authentication_review', 'rubric_review', 'history_review', 'demo_design', 'scope_review', 'baseline_review', 'independent_review', 'code_review', 'project_planning']);
if (manifest.version !== 1 || manifest.execution !== 'instruction_routing' || !Array.isArray(manifest.roles)) throw new Error('Invalid Muse team manifest.');
const roleText = new Map();
export const TEAM_REGISTRY = Object.freeze(manifest.roles.map(role => {
  if (!/^[a-z][a-z0-9_-]{0,60}$/.test(role.id) || ids.has(role.id) || !['pet', 'development'].includes(role.audience) ||
      ![role.label, role.description, role.scope].every(value => typeof value === 'string' && value.trim()) ||
      role.instructions !== `roles/${role.id}.md` || !Array.isArray(role.capabilities) || !role.capabilities.length || role.capabilities.some(value => !capabilities.has(value)) ||
      !Array.isArray(role.sourceAgentIds) || role.sourceAgentIds.some(value => typeof value !== 'string' || !/^[a-z][a-z0-9_-]{0,60}$/.test(value))) throw new Error('Invalid Muse specialist definition.');
  ids.add(role.id);
  const instructions = read(`./${role.instructions}`);
  if (!instructions) throw new Error('A Muse specialist has no instructions.');
  roleText.set(role.id, instructions);
  return Object.freeze({ ...role, capabilities: Object.freeze([...role.capabilities]), sourceAgentIds: Object.freeze([...role.sourceAgentIds]) });
}));
const petPolicy = read('./pet-policy.md');
const developmentPolicy = read('./development-policy.md');
const baseInstructions = read('../instructions.md');

export function listSpecialists(audience) {
  if (audience !== undefined && !['pet', 'development'].includes(audience)) throw new Error('Unknown team audience.');
  return TEAM_REGISTRY.filter(role => !audience || role.audience === audience).map(role => ({ ...role, capabilities: [...role.capabilities], sourceAgentIds: [...role.sourceAgentIds] }));
}

export function getSpecialist(id, audience) {
  const role = TEAM_REGISTRY.find(item => item.id === id && (!audience || item.audience === audience));
  if (!role) throw new Error('Choose an available specialist from team:list.');
  return role;
}

export function hasPetHealthConcern(message) {
  const symptoms = message.toLowerCase().replace(/\b(?:no|not|without)\s+(?:signs? of\s+)?(?:pain|fever|vomiting|breathing difficulty|seizures?|poisoning|illness)\b/g, '');
  return /\b(sick|ill|illness|fever|temperature|heart|pulse|pain|vomit(?:ing)?|breath(?:ing)?|seizures?|poison(?:ing)?|collapse|collapsed|bleeding|urinating|medications?|medicine|prescriptions?|antibiotics?|sedatives?|insulin|dosage)\b|allergic reaction/.test(symptoms);
}

export function selectPetSpecialist(input) {
  // Only the current task and message can select from a fixed pet-only set.
  // Caller-supplied specialist IDs, previous messages and pet notes never route.
  if (input.taskPurpose === 'social_draft') return getSpecialist('social', 'pet');
  const message = typeof input.message === 'string' ? input.message.toLowerCase() : '';
  if (hasPetHealthConcern(message)) return getSpecialist('health-guidance', 'pet');
  if (/\b(buy|shop|shopping|marketplace|purchase|offers?|deals?|products?|supplies)\b/.test(message)) return getSpecialist('marketplace', 'pet');
  if (/\b(feed(?:ing)?|meals?|food|diet|nutrition|portions?|eat(?:en|ing)?)\b/.test(message)) return getSpecialist('nutrition', 'pet');
  if (/\b(train(?:ing)?|practice|progress|walks?|exercise|activity|enrichment|play|sleep|rest|bedtime|routine)\b/.test(message)) return getSpecialist('routines-training', 'pet');
  if (/\b(social|posts?|captions?|instagram|bio)\b|facebook page/.test(message)) return getSpecialist('social', 'pet');
  return getSpecialist('general', 'pet');
}

export function petSpecialistInstructions(input) {
  const role = selectPetSpecialist(input);
  return `\n\n${petPolicy}\n\nActive pet specialist: ${role.label} (${role.id}).\n${roleText.get(role.id)}`;
}

export function buildDevelopmentRequest(id, message, model = 'muse-spark-1.3') {
  const role = getSpecialist(id, 'development');
  if (typeof message !== 'string' || !message.trim() || message.length > 4_000) throw new Error('Supply a consultation message of 1 to 4000 characters.');
  if (typeof model !== 'string' || !model.trim() || model.length > 100) throw new Error('The configured Meta model needs attention.');
  return {
    model: model.trim(), store: false, reasoning: { effort: 'low' }, max_output_tokens: 2_048,
    instructions: `${baseInstructions}\n\n${developmentPolicy}\n\nActive development specialist: ${role.label} (${role.id}).\nScope: ${role.scope}\n${roleText.get(role.id)}`,
    input: [{ role: 'user', content: message.trim() }],
  };
}
