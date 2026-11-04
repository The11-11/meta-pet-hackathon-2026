# Meta Pet project brief

**Your pet’s companion.**

Meta Pet helps an owner keep track of everyday pet care and turn Muse Pet’s suggestions into actions they can review and approve. The core demo follows one real pet from profile and photo to a custom Muse avatar, care records and a social post draft.

## Names

| Name | Role |
| --- | --- |
| **Meta Pet** | The app: profiles, care, appointments, settings and social drafts. |
| **Muse Pet** | The AI companion inside Meta Pet. |
| **Petaverse** | The wider ecosystem vision for pets, companions and future connected products. |

Kai is the existing plush companion mascot. A generated custom portrait represents the owner’s own pet. Some current screens and source files still use the earlier “Muse Pet” app wording; these names define the intended brand structure.

## What works now

The Android-first Expo app also runs as a mobile web preview. Its verification record reports **163 passing automated tests**, passing TypeScript and lint checks, and an Android Hermes export. Browser checks cover day and night appearance, saved care records, appointments, conversations and owner-approved actions.

- Live Meta Muse chat and photo-to-Muse avatar generation have worked through the app. The fresh demo supports explicit connection setup at the photo step, rejects an incorrect token and generates a real plush portrait from Kai’s photo. Completing setup reaches the dashboard; reopening retains Kai’s profile, selected goals and the same generated portrait.
- Owners can record feeding, training, walks and rest, then review Muse Pet’s proposed care entries or appointments before saving them locally.
- Facebook and Instagram page details support local post drafts. A connected Meta model can draft for a selected page; approval saves the draft with the exact pet **@handle**. Editing a caption retains that mention.
- Real CC0 bark and meow recordings work in web sound previews. Native appointment alerts are configured but need a fresh native build and device testing.
- Demo and verified-account data use separate local storage scopes. A development connection token stays in memory; the model provider key stays on the backend.

See the [app README](../apps/meta-pet/README.md) for operation and the [verification record](../apps/meta-pet/verification.json) for evidence and limits.

## Demo boundary

Real Facebook OAuth remains pending private App Secret setup, auth-schema initialization and an owner-driven login. The explicit demo route exercises onboarding without claiming a Facebook session. Physical Android/iPhone installation has not been verified.

Care records and approved tasks are device-local. The collar screen is a concept: hardware, microphone/speaker routing, location and physiological monitoring are disabled. Social mentions are caption text; platform metadata tagging, page creation and live publishing are not connected. Shop and coin screens are demonstrations, with no real crypto transfer, purchase or Marketplace payment.

For a requested live social draft, only the selected page’s display name, handle, bio and platform, plus minimal identifiers, are sent to the configured backend and Meta AI. Page URLs, other pages, photos, health records, appointments and conversation history are excluded from that request.

## Workspace and submission plan

The canonical app folder is **`apps/meta-pet`** in this workspace. `docs/` holds the working brief and demo plan; `media/` holds presentation evidence; `submissions/` holds reviewed submission material; `backups/` preserves recovery copies.

The submission target is **1 November 2026 at 04:00 SAST**, four days before the official deadline; aim to finish the upload during **31 October**. Keep the pitch focused on the owner’s experience, the working demo and the Petaverse vision. Include earlier testing or reused-work details where the official rules or entry form require them. Internal development history stays in [workspace notes](WORKSPACE-NOTES.md).

The [update baseline](HACKATHON-UPDATES.md) records confirmed dates and the [Official Rules](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver): Impact 30%, Meta AI tooling 25%, technical depth and execution 20%, and demo 25%. Prioritize a useful owner outcome and reliable working demo. Check required entry fields and any rule or date changes before finalizing the submission.

Meta Pet, Muse Pet and Petaverse are independent project concepts. These names do not establish an official Meta product or partnership.


