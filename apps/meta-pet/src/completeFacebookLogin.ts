import { bindDemoProfileHandoff, type HandoffStorage } from './demoProfileHandoff.ts';
import type { Owner } from './ownerData';

type VerifiedSession = { owner: Owner | null; identity: string | null };

/** Complete verification and any initiating profile invitation before publishing an owner. */
export async function completeFacebookLogin(storage: HandoffStorage, verify: () => Promise<VerifiedSession>, isCurrent: () => boolean, handoffId?: string): Promise<VerifiedSession> {
  if (handoffId && !/^handoff-[0-9]+-[a-z0-9]{1,16}$/.test(handoffId)) throw new Error('Reopen Settings before connecting this demo profile.');
  const selected = await verify();
  if (!isCurrent()) throw new Error('Your sign-in changed. Please try again.');
  if (handoffId) {
    if (selected.owner?.mode !== 'facebook' || !selected.identity) throw new Error('Verify your Facebook sign-in before reviewing the demo profile.');
    const bound = await bindDemoProfileHandoff(storage, handoffId, selected.owner.id);
    if (!isCurrent()) throw new Error('Your sign-in changed. Please try again.');
    if (!bound) throw new Error('The demo profile changed or this choice expired. Return to the demo and connect again.');
  }
  return selected;
}
