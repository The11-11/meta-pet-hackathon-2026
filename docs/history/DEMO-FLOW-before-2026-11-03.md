# Meta Pet demo flow

Show one owner and one pet moving through a complete care task. Keep the visible distinction between a live Meta response, the local guide and a saved local action.

## Before recording

- Open the canonical app at `apps/meta-pet` and use its [README](../apps/meta-pet/README.md) to start the preview and backend.
- Confirm the intended pet photo is available and the owner agrees to send it for avatar generation.
- For fresh demo setup, open **Connect Muse for this preview** on the photo step, enter the private development connection details and choose **Connect and test Muse**. Completed profiles can use **Settings → Test Meta connection**. These tests activate the connection for the current app session without sending the pet photo or records; reopening clears the memory-only token.
- Use a clean demo profile for the setup walkthrough. Keep saved owner data intact and keep private settings, tokens and provider keys out of the recording.

## Main walkthrough

1. **Welcome → Facebook signup.** Explain that the account belongs to the owner. Use **Continue with Facebook** only after real OAuth has been configured and verified. Until then, visibly choose **Explore the demo** and explain that it follows the same pet-setup sequence without signing in.
2. **Pet profile.** Enter the pet’s name and details. New owners begin with empty care records rather than another account’s history.
3. **Photo → Muse avatar.** In the demo, connect and test Muse from this step first. Take or choose a photo, show the upload explanation, generate the portrait through Meta, and choose **Continue with this avatar**. Select care goals, review setup and open the dashboard. Show the saved custom portrait; Kai remains the fallback mascot when no portrait is available.
4. **Care.** Add a feeding, walk or training note and an appointment with its local date and time. Switch between day and night. Reopen the app to demonstrate persistence, then reconnect the memory-only development token if the session restarted.
5. **Muse Pet tasks.** Ask about the saved care information, then ask Muse Pet to prepare a care entry or appointment. Show the proposal, approve it and confirm exactly one local record appears. A suggestion becomes a saved task only after approval.
6. **Social drafts.** Open Social pages and save a Facebook or Instagram page plan with a pet @handle and optional public bio. Ask Muse Pet to draft for that platform. Show the live draft and exact @mention, approve it, then open the saved draft and edit the caption. Explain that this saves a local draft; nothing is published to Facebook or Instagram.

## Useful evidence

Show the generated avatar, a saved care action, the live model label and a social draft with the correct @handle. A short reopen check demonstrates that local work persists. The current [verification record](../apps/meta-pet/verification.json) reports 163 passing tests and records the completed browser flows.

The optional Settings sound preview can demonstrate the approved real bark and meow. Describe it as an in-app web preview. Phone notifications and custom alert sounds still need a fresh native build and physical-device verification.

## If a live service is unavailable

Show the actual error and keep the current photo or task available to retry. The local guide can demonstrate care and starter captions when selected and clearly labeled. Do not present a local response as a live model result, a demo as a Facebook login, or a draft as a published post.

Leave collar audio, hardware monitoring, real coin payments and purchases out of the working demonstration; those integrations are not connected.


