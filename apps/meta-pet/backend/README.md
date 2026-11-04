# Muse Pet backend

Local companion backend for the Android-first Meta Pet prototype. The app tagline is **Your pet’s companion**.

## Run

Use Node.js 24 or newer and the installed backend dependencies:

```sh
node --env-file-if-exists=.env src/server.mjs
```

The server starts on `http://127.0.0.1:8787`. Without a model key it returns explicitly labeled, deterministic demo care guidance. Demo guidance is not a live Muse response.

For a physical phone on a trusted local network, set `HOST=0.0.0.0` and use the computer’s local network address in the app. Do not expose this development server to the public internet. A production release still needs HTTPS, deployed account-bound storage, backups and operational controls; the local Facebook session and page-memory implementation below are prototype infrastructure.

## Enable Meta Muse

Copy `.env.example` to `.env` locally and configure:

- `MODEL_API_KEY`: your Meta Model API key, held only by the backend.
- `MUSE_CLIENT_TOKEN`: a separate local development token entered in the app’s connection settings. A verified Facebook session can also authorize the configured backend.
- `MODEL_NAME`: defaults to `muse-spark-1.3`.

Send the development token as `Authorization: Bearer <token>`. Never put the Meta API key in a mobile bundle or an `EXPO_PUBLIC_` variable. Do not commit `.env`. Client tokens here are for local development, not production identity.

Facebook sign-in requests only `public_profile`, with the provider’s default email permission disabled. A deterministic non-deliverable placeholder supplies the auth library’s required email field when Facebook omits email; it is not a contact address. Optional city/Page access is requested separately. See [Facebook Login](FACEBOOK-LOGIN.md).

Live chat calls Meta’s Responses endpoint with provider storage disabled. Pet records and bounded page-memory context included with a live request are still transmitted to Meta for inference. There is no background transmission. Care logs, appointments, assistant replies and approval decisions are not persisted by this adapter; verified owners have the separate private page-memory summary described below. The server never logs chat bodies or keys.

## Mobile API

`GET /health` returns `status`, `mode`, `collarConnected: false`, and `requiresAuth`.

It also returns `providerConfigured`, `authConfigured`, `model`, `capabilities`, and `providerVerifiedAt`. A configured key is not proof that Meta accepts it. `providerVerifiedAt` is null until this process has successfully received a live reply; it describes the last successful response, not continuous provider availability.

`POST /api/muse/check` with `{}` tests the provider using the same client authorization. It sends no pet records. Without a key it returns `verified: false` and an explicit demo message; with working credentials it returns `verified: true` and a timestamp. Errors remain errors. See [Connect Muse](CONNECT-MUSE.md) for the prepared setup.

`POST /api/muse/chat` accepts:

```json
{
  "message": "Summarize today’s care records",
  "pet": { "name": "Milo", "species": "dog" },
  "logs": [
    { "type": "walk", "label": "Morning walk", "note": "Owner recorded", "recordedAt": "2026-10-22T06:00:00Z" }
  ],
  "appointments": [
    { "title": "Vet check-up", "date": "2026-10-30T07:30:00Z", "note": "Bring care notes" }
  ],
  "history": [
    { "role": "user", "content": "We are working on recall training." }
  ]
}
```

Limits: message 4,000 characters; at most 100 logs and 50 appointment records; at most 12 prior user/assistant messages; total body 64 KiB; 30 requests per network address every ten minutes. Conversation context retains the most recent excerpts, capped at 3,000 characters per message and 9,000 characters total, so a long model reply remains usable on the next turn. The server strips unknown context fields and rejects privileged history roles. Browser origins are restricted by `ALLOWED_ORIGINS`; native requests do not include an Origin header.

Success:

```json
{
  "mode": "demo",
  "reply": "...",
  "proposedActions": [],
  "sources": ["owner-provided care records"],
  "collarConnected": false,
  "memory": { "enabled": false, "saved": false }
}
```

Errors use an appropriate HTTP status and `{ "error": "A safe explanation" }`. Provider failures remain failures; they are not disguised as successful live answers.

## Private pet-page memory

A care chat with a verified Facebook session, matching `X-Muse-Owner` and saved `pet.id` uses one private file at `backend/data/memory/<sha256 owner id>/<sha256 pet id>/memory.md`, relative to the app root. The cookie establishes the owner; a supplied header alone cannot. A legacy `MUSE_CLIENT_TOKEN`, an unverified owner claim or guest demo never grants memory access. When an owner header and valid Facebook session accompany a development token, the verified session and exact owner binding take precedence.

The human-readable file retains the latest owner-provided pet profile and care goals, up to eight recent owner questions of 500 characters each, and up to twenty deduplicated explicit `remember ...` or `please remember ...` notes of 500 characters each. The entire UTF-8 file is capped at 16 KiB, so the oldest recent questions and then oldest notes may be removed to fit. Only whitelisted fields are saved; credential-like text is excluded. No assistant response, proposed action, approval result, care log or appointment is saved. Current request profile fields, including cleared fields, override earlier snapshots.

Later care requests load bounded notes and question history as unverified past data, never instructions or proof of a completed action. Earlier profile snapshots are excluded from model context; the current request supplies those facts. Social drafting (`taskPurpose: "social_draft"`) never reads, writes or receives page memory. A signed-in owner can save memory even when the backend uses its deterministic demo guide; that guide does not perform model-based recall. The same verified owner and pet ID can read the file after a backend restart. Signing out leaves the private file in place; the app only offers it again for the matching verified owner.

Owner-bound endpoints, independent of model-key availability:

- `GET /api/muse/memory?petId=<id>` returns `{ "available": true, "exists": false, "updatedAt": null, "markdown": "" }` when absent, or the page's bounded Markdown and timestamp when present.
- `POST /api/muse/memory/clear` with `{ "petId": "<id>" }` removes only that owner's selected page and returns `{ "cleared": true }`. Clearing removes retained notes and questions and invalidates already-running replies, so they cannot recreate the file afterward.
- Chat responses include `memory: { enabled, saved }`. A completed reply with `saved: false` must not be presented as saved memory. Unreadable memory stops the care request with a bounded error; a failed write preserves the care reply but reports it unsaved.

Writes use same-directory temporary files and atomic replacement. Owner/pet IDs are hashed, linked paths and files are rejected, and corrupt or oversized files are not forwarded to the model. Serialization and request ordering protect concurrent calls within one backend process: a slower older reply cannot restore profile fields cleared by a newer request. This is local, single-process file storage, not cross-process coordination or a deployed multi-instance database. Keep `backend/data/` private, excluded from source and archives, and protected/backed up with the authentication database. Real owner login and live cross-restart recall still need owner-driven verification; automated checks use only disposable synthetic files and stubbed provider replies.

## Eve agent foundation

`agent/agent.ts` and `agent/instructions.md` form an Eve 0.82.0 project. The Meta provider is configured directly for the hackathon, and Eve’s optional default tools are disabled. Install dependencies with `pnpm install`; `pnpm agent:dev` opens Eve’s separate development interface when a server-side key is configured. `pnpm typecheck` validates the agent definition.

The mobile adapter uses a bounded proposal harness on `/api/muse/chat`; it does not yet use Eve’s durable session orchestration. Both paths share the same care instructions. The mobile request advertises `prepare_care_entry` and `prepare_appointment` when a pet ID is supplied. Function calls are validated and suspended for review. There is no automatic mutation or external side effect at this stage. The separate Eve development interface has no action tools configured.

`proposedActions` contains at most three validated suggestions with a random ID, target pet ID, 15-minute expiry, type and exact payload. The mobile app independently validates them, shows the full details, and requires **Approve and save**. Approved entries and their review decisions are written together locally before success is shown. Deterministic record IDs prevent duplicate saves across retries and app reloads. Dismissed suggestions leave the timeline unchanged. Failed saves remain retryable; successful retries clear the write-error banner.

The latest conversation is stored with the care records: up to 40 messages and 40,000 content characters, plus validated suggestions and decisions. Older app data loads without a conversation. Pending suggestions retain their original expiry after reopening; expired cards cannot save records. Approval only looks up canonical suggestions in the active conversation. Confirmed owner decisions are included in model history. Changes to the pet profile or server URL start a fresh conversation, and in-flight replies from an earlier session are discarded. Re-entering the memory-only development token on the same server preserves the conversation. This token is not a production account identity.

The mobile adapter budgets the entire UTF-8 request below 60 KiB, leaving headroom below the server's 64 KiB limit. It preserves the owner's message and pet profile while dropping oldest conversation excerpts, then oldest care records and furthest appointments as needed. This trims only what is transmitted; it does not delete locally saved records.

Care entries cannot claim future activities are completed. Appointment dates must include a timezone and be in the future. An appointment entry is a local note, not a vet booking or delivered reminder. No server endpoint executes arbitrary model commands. The local demo can demonstrate a proposal with `Record walk: Walk just completed`.

Durable tasks, collar audio, reminder delivery, social publishing, purchases, and wearable connections remain future integrations. The app can show social drafts as text, but cannot publish them.

## Checks

```sh
node --test test/*.test.mjs
pnpm typecheck
```

Tests cover honest demo status, care-record grounding, validation limits, CORS, live authorization, server-side credentials, Meta protocol shape, provider error handling, and request budgets. Muse Spark and Muse Image were additionally verified with the owner's real private key on 25 October 2026.

The harness checks additionally cover proposals without mutations, owner-approved care and appointment saves, duplicate protection after reload, expired or wrong-pet suggestions, unsupported tool calls, invalid dates, client-side action validation and connection verification. Run `node --env-file-if-exists=.env scripts/check.mjs` from this backend folder for a real credential check without pet data; it exits with code 2 when the key is missing.

References: [Eve getting started](https://eve.dev/docs/getting-started), [Eve custom provider configuration](https://eve.dev/docs/agent-config), [Meta Responses API](https://dev.meta.ai/docs/protocols/responses).

## Muse specialist team and pet product discovery

See [Muse team guide](../../../docs/MUSE-TEAM.md) for the 16 authored pet/development roles, pet-specific care context, Marketplace handoff and extension workflow. Pet chat keeps its existing single-request specialist routing. The separate local development coordinator now makes real planner, specialist, builder and reviewer requests through the same Meta provider. It does not add a development endpoint to pet chat or inherit Codex computer sessions.

From this backend directory, run `npm run team:coordinate -- --request "Describe the improvement" --file src/marketplace.ts` for a coordinated plan. Add `--mode patch` for an independently reviewed replacement proposal, and repeat `--file` for each explicit app-root-relative source path. `node scripts/coordinate.mjs --dry-run --request "Describe the improvement" --file src/marketplace.ts` previews inputs without provider access or credential reads in the command.

Runs save private ignored artifacts under `backend/data/coordination/`. Patch generation never writes app source. Applying is a separate operator action: `npm run team:apply -- --artifact "backend/data/coordination/RUN_ID/patch-manifest.json" --approve "EXACT_REVIEWED_MANIFEST_SHA256"`. Review the exact artifacts first. Apply checks hashes, new-file absence and reviewed status, journals writes and attempts rollback on error; it never runs model-generated or verification commands. Run the project checks manually after approved application.

Coordination permits up to three parallel specialists, six Meta calls per patch run (five for a plan), a 120-second overall budget and a 25-second limit per request. Context is limited to eight explicit text source files, 64 KiB per file and 160 KiB total. Private, authentication, policy, generated, linked and coordinator/self-modification paths are blocked. See the guide for output bounds and the full command, review and add-on contracts. This is guarded local execution, not an operating-system sandbox or background autonomous maintenance.
