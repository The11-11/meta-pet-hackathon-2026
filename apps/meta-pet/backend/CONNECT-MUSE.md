# Connect Muse Pet to Meta

The app and local API harness are ready. Live Muse Spark 1.3 and photo-based Muse Image avatar generation were verified with the owner's private key on 25 October 2026. Source copies still require their own server-side key.

1. Open `backend/.env` on this computer and put your approved Meta Model API key after `MODEL_API_KEY=`. Keep this key out of chat and the mobile app. The default model is `muse-spark-1.3`.
2. A separate `MUSE_CLIENT_TOKEN` has been generated in that private file. This is the token to enter in the app, not the Meta key. If you are using a source archive, copy `.env.example` to `.env` and choose a long random development token yourself.
3. Start `Start-Muse.cmd` from the project folder. If an older Muse backend is already running on port 8787, close that instance first. Restart after changing `.env`.
4. In the app’s Settings, use `http://127.0.0.1:8787` on this computer and enter the separate connection token. Press **Test Meta connection**. The test first saves the address and activates that token for the current app session, then sends a brief message without pet records. A successful test and chat use the same activated settings. **Save Muse connection** can also activate the settings without making a provider call.
5. Ask Muse about your pet’s records. To try an approved task, say “Record a walk I just completed” and provide any details you want saved. Review the proposed fields before pressing **Approve and save**. For an appointment, provide the date, time and timezone. Saving an appointment note does not book a vet. A local phone reminder additionally needs the native app, notification permission and enabled care alerts.

For a physical phone, use the computer’s reachable local network address in Settings and set `HOST=0.0.0.0` only for trusted local network testing. The token stays in app memory and needs entering after an app restart.

The preview has two modes: a clearly labelled demo guide without a Meta key, and live responses after Meta credentials work. A configured address or key alone is not proof of live inference.

Facebook Login is optional for this local Muse connection. A configured Facebook owner can use their verified session with the configured authentication backend; the local prototype can use its separate development connection token. Neither method replaces the server's Meta Model API key.

The provider check rejects unfinished or failed model responses, including token-limited output, even if the provider returned HTTP 200. A live badge appears on a reply only after the server receives a completed provider response.

Muse uses low reasoning effort and a 4,096-token output budget, which includes the model’s internal reasoning. This prevents the earlier 1,600-token setting from consuming its allowance before producing a visible answer in some conversations. The app displays the backend’s bounded diagnosis for non-authentication errors rather than reporting every failure as a connection-settings problem.

This first harness supports guidance, care entries and appointment entries. Collar hardware, social publishing, payments and cryptocurrency remain separate integrations. Approval changes local records on the device; this is not a public multi-user service or background agent.

For the main signup demo, create the pet profile, take or choose a photo, generate the custom Muse avatar, then finish the care setup. Existing profiles can open **Settings → Create Muse avatar**. Avatar generation uses the same server key and verified session or separate development token; see [Avatar API](AVATAR-API.md). New custom portraits are static images. Kai remains the waving brand guide when no portrait has been chosen.

Official references: [Meta Responses API](https://dev.meta.ai/docs/protocols/responses), [Meta tool calling](https://dev.meta.ai/docs/tool-calling), [Meta models](https://dev.meta.ai/docs/models).
