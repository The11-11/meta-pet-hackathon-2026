# Meta Pet

**Submission checkpoint — 4 November 2026:** 325 tests, TypeScript and lint passed again against unchanged application code. Public deployment `dpl_5CHiMHtuesbnsRuBCNpisT2Mqp7R` restores the supervised API connection; a real Meta Muse connection check passed in the browser. The entry form is verified and drafted; it needs public open-source GitHub and three-minute demo-video links. No entry has been submitted by this work. See [actual form mapping](../../submissions/FORM-MAPPING.md) and [current checklist](../../submissions/FINALIZATION-BLOCKERS.md). Older dated checkpoints below remain history. Physical-device checks and independent tester completion remain unverified; WhatsApp stays disabled and collar hardware stays conceptual.

**Integration checkpoint — 3 November 2026:** 325 tests, TypeScript and lint pass. Camera permission recovery, notification permission refresh and native Facebook profile-choice completion are implemented. WhatsApp opt-in, appointment/walk reminders and cancellation are implemented behind verified account access. The updated public demo is READY and Settings was browser-verified to show Not connected/disabled. Meta created the approved test-number setup, but real pairing/delivery is unverified: the app is unpublished, business verification remains incomplete, and the owner chose to leave it pending. Phone signing/install and real-device delivery tests remain outstanding. Collar stays conceptual; real payments/crypto and social publishing remain unconnected. The earlier frozen source ZIP/video are unchanged snapshots. See [WhatsApp setup](backend/WHATSAPP-SETUP.md).

Earlier release checkpoint: **3 November 2026 — 282 tests, TypeScript and lint passed**. The public rehearsal verified sample-artwork avatar generation and an owner-approved future reminder. Deployment dpl_BJeuQCSC37q5mh8bnquz4KYMew68 is READY; post-deployment browser verification is passed. Browser checks verified the new entry bundle hash in the rendered public deployment. Pasted 131-character guided input stays visible with a 1–120-character validation message and Review disabled; a 43-character valid description enables Review and was cleared without saving. Hosted guest photo setup shows Facebook guidance, no token/address panel, a working return-to-sign-in button and optional skip. Fresh public API boundary checks passed. Final real Petaverse Login consent returned directly to Care: the same test pet, custom avatar, future DEMO CHECK-IN and zero past-care records restored. Unsaved guest setup was not copied. This was the same browser and public origin, not cross-device synchronization. See [reviewer quickstart](../../submissions/REVIEWER-QUICKSTART.md), [current demo flow](../../docs/DEMO-FLOW.md) and [finalization checklist](../../submissions/FINALIZATION-BLOCKERS.md). Dated earlier checkpoints below remain development history.

**Your pet’s companion**

**Meta Pet** is the pet-care app in the **Petaverse** ecosystem. **Muse Pet** is its AI companion. The Android-first prototype records a real pet’s care and supports check-ins with Muse Pet. It uses Expo SDK 57, React Native, TypeScript, and Expo Router. The same project can support an iPhone version, which still needs platform testing and signing setup.

The shared Meta Pet header appears once on every tab and form page. Kai is the chocolate-brindle plush Muse companion, based on the owner's approved dog reference. Earlier screenshots and the preserved logo bitmap use the previous Muse Pet app wording; the current header uses the existing blue mark beside a native Meta Pet wordmark.

## What is included

- Facebook signup and a separate local demo route: welcome → pet profile → photo and custom Muse avatar → care goals → review → care dashboard. New owners start with empty care records. Saved setup and custom portraits are restored on the same device.
- Camera or gallery selection prepares a compact pet photo for Meta Muse Image. Generation preserves the pet’s distinctive features on a plush Muse body. Only a real provider image is shown as a custom avatar; errors keep the photo available to retry. Local development previews offer explicit Muse connection setup before generation; hosted guests are directed to Facebook sign-in for live Muse and avatar generation. Owners can also skip the photo and create an avatar later in Settings.
- Day and night palettes across the app. The sun/moon button in the shared header switches immediately; Settings offers Day, Night, or Device. The saved Device option follows the device’s appearance setting.
- A pet profile, feeding, training, walk and rest records, and appointment entries saved locally on the device.
- Bark, Meow, Default and Quiet care-alert choices in Settings, saved with the pet profile. Bark and Meow use real CC0 animal recordings, with a Listen button and a test preview. A native build can request notification permission and schedule local reminders for saved future appointments; the web preview plays sounds in the app.
- Muse Pet with a clearly labeled local demo guide and an optional connection to the server-side Meta Muse adapter.
- A Meta connection test and Muse action review cards. Owner approval saves care entries and appointment entries on the device, with duplicate protection and visible save errors.
- A Social pages workspace for Facebook and Instagram page plans or existing-page details. Muse offers social help, creates live post drafts through a configured Meta connection (or labeled starter captions in the local guide), and includes the pet’s saved @handle automatically. Review and approve a post draft, then edit it in Social pages. Mention text is included in the caption; no live page is created or post published.
- Kai waves her paw automatically, and tapping her starts another greeting. The animation respects the device’s reduced-motion setting. Her separate body/paw layers are in `assets/`; the original Muse artwork is preserved.
- Recent Muse conversations, pending suggestions and review decisions are saved with local care data. Approved tasks remain saved after reopening. Changing the pet profile or server address starts a fresh conversation.
- Private persistent Muse page memory for each verified Facebook owner and pet, with a review/clear screen. Full care records and conversation history remain device-local.
- A companion-collar concept screen. No collar, microphone, speaker, GPS, camera stream, heart-rate sensor, or temperature sensor is connected.
- A concept product shop with matching companion-collar, care-camera and smart-feeder images on shop and product-preview screens. Peta Coin redemptions remain local demonstrations: they do not transfer cryptocurrency, purchase or deliver goods, or pay on Facebook Marketplace.
- A local dog-trainer finder from Muse or a training entry. Choose a puppy-basics, loose-leash or confidence/behaviour goal, see a suggested trainer type and its match reasoning, then open area searches in Google Maps or Facebook. These are searches, not verified businesses, ratings, prices or availability.

Kai and her separate wave layers were created with the built-in image generator. The approved prompt is saved in `assets/kai-plush-prompt.txt`. The original Muse prompt remains in `assets/muse-dog-wave-prompt.txt`. The three transparent product-concept PNGs were also created with built-in ImageGen: `meta-collar-v1.png`, `care-camera-v1.png` and `smart-feeder-v1.png`, with matching `.prompt.txt` files in `assets/products/`. Local verification results and remaining integration work are recorded in `verification.json`.

Native appointment alerts require the owner to enable phone alerts and grant permission. Reminders aim for 15 minutes before an appointment (or the appointment time when saved closer); delivery and sound depend on phone settings and may be delayed. These are device-local reminders; no remote push service is connected. The prototype does not book veterinary appointments, publish social posts, diagnose a pet or translate barking.

## Facebook signup

Open the app and choose **Continue with Facebook**. Successful server-verified sign-in opens pet setup for new accounts, or the saved care dashboard for returning accounts. **Explore the demo** exercises the same setup without creating an account. Settings lets the owner sign out; this retains that owner's local profile for their next sign-in on this device.

The account belongs to the owner; the pet has its own profile within Meta Pet. During setup, take or choose a photo, generate the custom avatar, review it and continue. Existing profiles can use **Settings → Create Muse avatar**. The original photo stays out of persisted care data; only the compact generated portrait is saved. The app explains that generating an avatar sends the selected image to Meta AI. Photo pixels are excluded from ordinary text-chat requests. The native picker requests camera access only when taking a photo and does not request microphone access.

For a local development demo, open **Connect Muse for this preview** on the photo step and choose **Connect and test Muse** after entering the local server address and separate development token. The check sends no photo or care records. The token stays in memory; the Meta model API key stays on the backend. Incorrect-token rejection, a successful live Meta connection check and actual Kai photo-to-plush-avatar generation have been verified in this fresh demo. The fresh setup reached the care dashboard, and reopening retained Kai’s profile, selected goals and the same generated portrait.

The earlier 2 November local-readiness check saved the separate Facebook credentials privately, initialized the local schema and generated the expected authorization URL. Later that day the public callback completed real owner Facebook sign-in, live Muse guidance and same-browser profile/server-memory return. Petaverse Login uses App ID 947230411546979. T’s invitation remains pending; unrestricted reviewer access is not available while the Meta app remains unpublished. Follow [Facebook setup](backend/FACEBOOK-LOGIN.md); credentials remain server-side.

The frontend reads the public backend address from `EXPO_PUBLIC_AUTH_URL` (default `http://localhost:8787`). Restart Expo after changing it. Facebook mobile login uses the `metapet://` scheme and needs a development build and a reachable backend; it has not been tested on a physical phone.

Pet records remain in separate device-local storage for each verified account and for the demo. The older prototype's unscoped records are preserved but are not automatically assigned to a new Facebook owner. This is not cloud synchronization or shared-family access.

## Keep a demo profile after Facebook sign-in

Settings now shows an Account & memory card with **Continue with Facebook** for a demo owner. It first saves the current pet form, then stages a 30-minute local invitation. The initiating OAuth callback must verify Facebook and bind that exact invitation before a **Keep [pet]’s profile** review appears. An ordinary unrelated login cannot bind it.

Keeping copies only validated pet details, the saved Muse avatar, care notes and selected goals into an empty Facebook account on this device. It retains the account’s new pet ID and latest server/alert settings; the demo remains unchanged. Care history, appointments, conversation, social pages, rewards and development tokens are excluded. Existing account data is protected instead of overwritten. Start fresh dismisses the choice and opens setup. Saves complete before success is displayed, and failed writes remain retryable. This is same-device profile retention, not cross-device care-data sync.

Earlier 2 November checks found that **Datamatrix_HubSA** was a Facebook Login for Business app. The invalid-email request was removed and a separate ordinary **Petaverse Login** app was subsequently created and configured. Its real public sign-in and same-account return passed later that day. The explicit local **Keep the existing local pet’s profile** migration remains unverified; it was not replaced by silently copying the owner’s localhost profile into the public demo.

## Muse page memory

Open **Muse → View Muse page memory** to review or clear private server memory for the signed-in owner and selected pet. A verified Facebook session is required; a development token is not an account identity. Each owner/pet pair has its own `backend/data/memory/<hashed-owner>/<hashed-pet>/memory.md`, excluded from source control and submission archives. It survives backend restarts and signing out.

After successful care replies, Muse stores the current owner-provided pet profile and goals, up to eight recent questions, and up to twenty deduplicated explicit “Remember that …” notes. Entries are bounded to 500 characters and the complete file to 16 KiB; oldest entries can be dropped to fit. Relevant notes and questions are supplied to future care replies as untrusted historical context. Current profile fields win over old context. Assistant replies, approval results, social drafting inputs and guest demo/token-only chats are excluded. This does not synchronize the full care timeline between devices.

Clearing requires two steps and leaves device chat history separate. An older reply cannot recreate cleared memory. A read failure offers a confirmed reset, while failed saves leave the reply visible with an honest warning. This is private storage for the current single-process backend. The public demonstration uses a separate isolated store behind HTTPS; persistent unattended hosting and multi-instance storage remain separate work.

## Find local dog trainers

Open **Muse → Find local dog trainers**, or choose the same action in a training care entry. Enter a city manually, or explicitly choose **Use Facebook city** / **Use Page location**. A verified Facebook owner can request optional read-only access: profile city uses `user_location`; managed Page locations use `pages_show_list` and `pages_read_engagement`. Permission prompts only start after the owner chooses the follow-up connection button; basic login requests only `public_profile`; email is not requested. After Facebook returns, choose the source again to load available cities.

The finder requests no GPS or street address. Returned coarse areas stay in screen memory, clear when the account changes and are excluded from saved pet records and Muse model payloads. Search links contain only the chosen area and controlled trainer-goal words. The local development token cannot authorize Facebook location reads. A real owner login, optional permission grant and live Facebook city/Page import remain unverified.

## Pet social pages and mentions

Open **Muse → Open social pages**. Choose **Create page plan** or **Manage existing page**, select Facebook or Instagram, and save a display name, pet @handle and optional bio/public page URL. These are local reference details. Saving does not reserve a username, verify ownership, create a platform account, or connect publishing.

Choose **Open Muse → Draft a pet post**. With two saved platforms, specify Facebook or Instagram. With a configured live connection, Muse generates the caption using the selected page’s display name, @handle, bio and platform. **Approve and save draft** adds it to Social pages. Caption edits always retain the pet’s exact @handle. Editing a saved handle updates that pet’s local draft mentions, while pending proposals for the old handle require a fresh draft. Drafts and page details share the owner’s existing device-local storage scope.

On 25 October 2026 the owner explicitly authorized sending the selected page’s display name, @handle, bio and platform to the configured backend and Meta AI when requesting a draft. The request includes an internal profile identifier and a minimal pet identity to bind the returned draft. Page URLs, other social pages, previous drafts, photos, care records, appointments and prior conversation are excluded from social-draft requests. The backend enforces the same boundary and offers only the social-draft tool for that task. Ordinary care requests continue to omit saved social profiles and social draft approval turns.

Without a backend, the clearly labeled local guide still prepares a starter caption. Live connection errors stay visible and do not silently substitute a local caption. The real Meta model generated a Kai Facebook draft with the saved bio and exact handle, and the review flow saved that draft in the browser. Real page creation, platform metadata tagging, publishing, scheduling and analytics still need the relevant social APIs and account permissions; there is no background posting.

## Run on a desktop and Android phone

Use Node.js 24 or newer and pnpm. Windows is supported for this development workflow; an Ubuntu installation is not required.

Open a terminal in this project folder:

```sh
pnpm install
pnpm exec expo start
```

On this Windows computer, `Start-MetaPet.cmd` also opens the local web preview using an installed Node runtime or Codex’s bundled runtime. Keep that window open while using the preview.

Connect the computer and phone to the same trusted network. Use an Expo Go release that supports SDK 57 and the installed native modules, then scan the development-server QR code. You can also use a configured Android emulator. Starting an emulator locally requires Android Studio and its SDK tools.

Expo Go is a useful first preview. Custom notification sounds must be bundled into a fresh native build; Expo Go cannot provide them. The app reports this rather than claiming a custom phone alert was delivered. This project does not currently install `expo-dev-client` or provide a development-client build profile.

The app runs its local demo guide without a backend or API key. The first physical-device run has not yet been verified. If the installed Expo Go version cannot open this SDK, use a compatible development build rather than changing package versions at random.

## Optional Muse backend

Follow [Connect Muse](backend/CONNECT-MUSE.md) for the prepared private settings file, Windows launcher and app connection test.

The backend has its own setup guide in [backend/README.md](backend/README.md). Its demo mobile API adapter can be started separately; Facebook login additionally uses the installed Better Auth dependencies:

```sh
cd backend
node --env-file-if-exists=.env src/server.mjs
```

It listens on `http://127.0.0.1:8787` by default. Without a configured model key, the backend returns labeled deterministic demo guidance. That is different from a live Muse response.

To configure live inference, copy `backend/.env.example` to `backend/.env` and edit that server-side file locally. Set:

- `MODEL_API_KEY` to a Meta Model API key kept only on the backend.
- `MUSE_CLIENT_TOKEN` to a separate development token for local development clients. A verified Facebook session can also authorize live Muse.
- `MODEL_NAME` to the supported model you intend to use; the backend template supplies a default.

Do not put the provider key in the app, its source, a frontend `.env`, or an `EXPO_PUBLIC_` variable. On 25 October 2026, the owner's private key was verified against Muse Spark 1.3 and a real Kai portrait was generated with Muse Image 1.0 through the app. Facebook Login uses separate app credentials; those were configured for Petaverse Login on 2 November.

For a physical phone, set the backend’s `HOST` to `0.0.0.0` only on a trusted local network. In the app’s **Settings**, enter the computer’s reachable local address and port, for example `http://192.168.1.20:8787`. Use the base URL only: the app appends `/api/muse/chat` itself. `localhost` on a phone refers to that phone, not the computer.

Enter the separate development token in the same Settings screen when using development-token access. The connection address is saved with local app settings; the token stays in memory and must be entered again after the app restarts. Facebook owners use their verified session for the configured authentication backend.

When you send a connected chat message, the app sends the message, pet profile, recent care records, up to 20 upcoming saved appointments, and bounded recent conversation excerpts to the configured backend. In live mode, the backend forwards relevant context to Meta for inference. Appointment times in the care screen use the device’s local time; the backend demo guide labels its appointment times in UTC. It does not stream records in the background. The full care timeline remains on the device. Verified Facebook care chats also keep the bounded private page memory described above. The public demonstration adds verified-session authentication and HTTPS through the same-origin API. It remains supervised; persistent unattended hosting and a multi-instance storage design are separate work.

## Build an Android APK when ready

The included `eas.json` defines a `preview` profile with internal distribution and Android APK output. An APK can be installed directly on an Android test device; it is not a Google Play publication.

No Expo account login, EAS project linking, cloud build, signing setup, or store submission has been performed. When the owner is ready, run these commands from the project folder and review the account, project, identifiers, credentials, and any build charges shown by EAS:

```sh
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android --profile preview
```

Keep `preview.android.buildType` set to `apk` if configuration is regenerated. After a successful build, EAS provides an APK download for testing. A `production` profile is also present for later release work; using it does not automatically publish the app.

EAS cloud builds can be initiated from Windows. A later iPhone release needs iOS testing, Apple signing credentials, and the appropriate Apple developer/store setup. A local iOS simulator or local iOS build requires macOS and Xcode. These steps are not completed by creating this prototype.

See [Expo’s APK guide](https://docs.expo.dev/build-reference/apk/) and [EAS build-profile documentation](https://docs.expo.dev/build/eas-json/).

## Development checks

On 3 November 2026, **282 combined backend/client tests**, TypeScript and ESLint passed. The latest static web export passed with 56 public files and zero known private-credential matches. The earlier 269-test and 276-test checkpoints remain in `verification.json`. Previous Android Hermes exports do not verify installation or behavior on a physical phone. Optional Facebook location grants and native-device checks remain unverified.

The following are verification commands to run after changes, not a claim that all checks or physical-device tests have passed:

```sh
pnpm exec tsc --noEmit
pnpm exec expo lint
node scripts/validate-pet-sounds.mjs
pnpm dlx expo-doctor
```

The backend has separate checks:

```sh
cd backend
node --test test/*.test.mjs
pnpm typecheck
```

Run `pnpm install` inside `backend/` before its TypeScript/Eve checks if backend development dependencies have not been installed. The dependency-free mobile adapter can run without that installation.

Before handing the app to testers, verify on an Android device that care entries persist after reopening, appointment entries appear correctly, demo responses remain labeled, connection errors are understandable, public production live mode requires a verified Facebook session, while local development may use its configured token, and shop redemptions stay explicitly marked as demonstrations. No on-device test result is recorded in this README yet.

## Project map

- `src/app/`: Expo Router routes and layouts.
- `src/screens/`: mobile screens.
- `src/CareContext.tsx`: device-local care state and connection settings.
- `src/muse.ts`: local demo guidance and the mobile chat request.
- `assets/muse-dog.png`: Muse Dog character asset.
- `backend/`: mobile API adapter and the separate Eve agent foundation.
- `AGENTS.md`: project instructions for future coding work.

Use `pnpm exec expo install <package>` when adding Expo/native dependencies so versions match SDK 57. Consult the [SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) before changing Expo or React Native APIs. Generated `android/` and `ios/` projects should be configured through Expo app configuration and plugins rather than edited by hand.

## Prototype and competition history

This local prototype was created on **22 October 2026**. Preserve its development history for the hackathon submission. Meta Pet is an independent concept; it does not establish an official Meta product, partnership, coin, or payment integration.



## First public guided walkthrough checkpoint — 2 November 2026

[Open the Meta Pet demo](https://petaverse-meta-pet-demo.vercel.app). Choose **Let Muse guide me**. Muse explains setup, reviews a described meal or walk for explicit approval, and offers the next steps after a care entry is saved. The guide works without a backend; profile, chat and care data remain in that browser.

This export uses EXPO_PUBLIC_DEMO_ONLY=true and EXPO_NO_DOTENV=1. The normal local app uses the connected provider when the demo flag is unset. Only the freshly exported static frontend was uploaded. Live Meta responses, Facebook sign-in/account memory and AI avatar generation are separate pending public integrations. Product hardware, purchases and bookings remain concepts or external searches. Development records from 22 October 2026 are retained.

## Connected public demo checkpoint — 2 November 2026

[Open Meta Pet](https://petaverse-meta-pet-demo.vercel.app) and choose **Continue with Facebook**. Muse Pet guides setup and care review. The connected public origin now reaches live Muse and Facebook Login through the same-origin API. The first browser-only export above is retained as an earlier checkpoint.

A real Facebook sign-in, synthetic pet setup, live Meta reply, saved page memory, app sign-out and same-account return passed in one browser on this public origin. The pet profile returned without setup; the private server memory retained its original question and sequence1. This verifies device-local profile persistence and separate server memory, not cross-device profile synchronization. No care event was automatically saved. The original the existing local pet profile was not copied, and its explicit Keep the existing local pet migration remains unverified.

T’s Facebook Tester invitation is **pending acceptance**. Public avatar generation and physical-device behavior remain unverified. The complete regression suite passed **276 tests**, TypeScript and lint. Production Muse requires a verified Facebook cookie and matching owner header; shared development tokens are restricted to local development.

This is a supervised demo: the computer, backend and temporary HTTPS tunnel must remain running. If that tunnel address changes, update the API rewrite. Private backend settings, authentication data and memory stay server-side. Product hardware, purchases and bookings remain concepts or external searches.

Tester acceptance: while signed into the invited Facebook account, open https://developers.facebook.com/settings/developer/requests/ and accept the Petaverse Login Tester invitation. The route was verified through Meta’s Developer settings → Requests navigation; T’s own request list and acceptance were not accessed.

## Finalization checkpoint — 3 November 2026

Deployment dpl_BJeuQCSC37q5mh8bnquz4KYMew68 is READY; post-deployment browser verification is passed. Browser checks verified the new entry bundle hash in the rendered public deployment. Pasted 131-character guided input stays visible with a 1–120-character validation message and Review disabled; a 43-character valid description enables Review and was cleared without saving. Hosted guest photo setup shows Facebook guidance, no token/address panel, a working return-to-sign-in button and optional skip. Fresh public API boundary checks passed. Final real Petaverse Login consent returned directly to Care: the same test pet, custom avatar, future DEMO CHECK-IN and zero past-care records restored. Unsaved guest setup was not copied. This was the same browser and public origin, not cross-device synchronization.

The public authenticated rehearsal generated a custom portrait from nonprivate project artwork, selected it explicitly and retained it after reload. It did not use a real pet photo. Muse refused an invented completed demonstration walk and left past care at zero. It then proposed a future local DEMO CHECK-IN for **4 November 2026 at 09:00 SAST**. Nothing was saved before approval; explicit approval saved one appointment note, retained with the avatar after reload. This is not a veterinary booking.

The source now gives a Facebook re-sign-in message for expired bound sessions, explains hosted-guest limits without an unusable token panel, and visibly validates overlong guided descriptions. **282 tests, TypeScript and lint passed**. The new static bundle is entry-9f3e8e144e06ed9c73d7b53d7436835d.js; the export audit found 56 public deployment files, 75 audited local files, zero private files and zero known credential matches.

A 90-second captioned evidence walkthrough is saved as a separate local review artifact. It assembles captured app screens; it is not a claim of an unedited continuous recording or an accepted video format. Confirm the actual form’s limits before uploading. Create the final source archive after source and documentation freeze, then check its manifest, hashes and privacy audit. Source-format requirements remain unverified.

Today’s finish plan is **3 November**. The earlier **1 November at 04:00 SAST** target is historical and elapsed. The official deadline remains **5 November at 04:00 SAST**, per the [Meta schedule](https://dev.meta.ai/events/global-hackathon). Actual entry fields, access/format limits and final declarations still need review in the accepted-participant form. No entry was submitted by this work.

T’s invitation remains pending. Meta’s Publish screen shows business verification incomplete and Publish disabled, so do not promise unrestricted Facebook reviewer access. Keep the host computer, backend and temporary tunnel running for the supervised demo. Native behavior, cross-device care sync, live hardware, purchases, publishing and WhatsApp delivery remain unverified or unconnected. Preserve the original **22 October 2026** prototype history and answer earlier-work questions accurately.
