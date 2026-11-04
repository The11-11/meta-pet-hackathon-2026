import type { CareKind, PetProfile } from './types';

export type MarketplaceIdea = {
  id: 'feeding' | 'walk' | 'training' | 'sleep';
  title: string;
  query: string;
  url: string;
  reason: string;
  check: string;
};

const categories = ['training', 'walk', 'feeding', 'sleep'] as const;
const copy = {
  feeding: { title: 'Mealtime essentials', reason: 'Easy-to-clean bowls for everyday meals.', check: 'Check material, size and cleaning instructions. Food choices should follow their existing diet.' },
  walk: { title: 'Out and about', reason: 'A comfortable way to explore or travel.', check: 'Measure for fit and check closures, condition and escape resistance.' },
  training: { title: 'Play with a purpose', reason: 'Enrichment to support short, rewarding sessions.', check: 'Choose species-appropriate toys that cannot be swallowed. Supervise play and check for damage.' },
  sleep: { title: 'A cosy place to rest', reason: 'A washable resting spot for their daily routine.', check: 'Check dimensions, washable materials and condition. Clean second-hand items before use.' },
};

export function marketplaceIdeas(pet: Pick<PetProfile, 'species'>, goals: readonly CareKind[] = []): MarketplaceIdea[] {
  const species = pet.species.trim().toLowerCase();
  const animal = ['dog', 'canine'].includes(species) ? 'dog' : ['cat', 'feline'].includes(species) ? 'cat' : 'pet';
  const queries = {
    feeding: `${animal} feeding bowl`,
    walk: animal === 'dog' ? 'dog harness' : `${animal} carrier`,
    training: `${animal} enrichment toy`,
    sleep: `washable ${animal} bed`,
  };
  // Only controlled species/category words leave the device. Never put names,
  // care notes, diagnoses, appointments, account IDs or location into URLs.
  return [...categories].sort((a, b) => Number(goals.includes(b)) - Number(goals.includes(a))).map(id => ({
    id, ...copy[id], query: queries[id],
    url: `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(queries[id])}`,
  }));
}
