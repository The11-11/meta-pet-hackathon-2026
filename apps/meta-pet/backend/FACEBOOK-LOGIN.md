# Facebook Login for Meta Pet

Facebook Login uses Better Auth 1.7.12 with its Expo plugin. Better Auth owns OAuth state, the provider code exchange, callback validation, session cookies, and session revocation. An onboarding demo is a separate local mode: entering a name or opening the demo never creates a Facebook account or authorizes live model calls.

## This computer’s app

The owner supplied **Datamatrix_HubSA**, App ID **2139588153438351**, on 25 October 2026. The ID is saved as `FACEBOOK_CLIENT_ID` in the private backend settings. On 2 November, the owner saved the separate `FACEBOOK_CLIENT_SECRET` privately. Local auth-schema setup and the login preflight passed: the configuration endpoint reported available and the social sign-in endpoint generated the expected Facebook authorization URL, callback, state and cookie. Meta acceptance of the credentials and callback registration, and a real owner-driven login, still need verification. Neither the App Secret nor the Meta model key belongs in chat or frontend configuration.

The configured local callback is `http://localhost:8787/api/auth/callback/facebook`. Register the callback in this Meta app’s Facebook Login settings. After the secret has been saved, run the authentication setup command and restart the backend, then verify an owner-driven login. App credentials, schema readiness and a real Facebook session are separate checks; setting an App ID alone does not connect an account or authorize social publishing.

## Configure the backend

Install the backend dependencies, or use the workspace's installed packages. Set these server-only environment variables using `backend/.env.example` as a guide:

| Variable | Purpose |
| --- | --- |
| `FACEBOOK_CLIENT_ID` | The Meta app's numeric App ID. |
| `FACEBOOK_CLIENT_SECRET` | The Meta app's App Secret. Never put it in Expo public variables. |
| `BETTER_AUTH_SECRET` | A unique, high-entropy secret containing at least 32 characters. Keep it stable across restarts. |
| `BETTER_AUTH_URL` | The backend origin, for example `https://api.example.com`, without an auth path or query. |
| `AUTH_TRUSTED_ORIGINS` | Comma-separated exact web frontend origins. Defaults to `http://localhost:8081,http://localhost:8083`. HTTPS wildcards are rejected. |
| `AUTH_DATABASE_PATH` | Optional SQLite path, relative to `backend/` or absolute. Defaults to `data/auth.sqlite`. |

Generate the authentication secret locally with a cryptographically secure generator, such as Node's `randomBytes(32).toString('base64url')`. Do not use a sample secret. Production configuration requires HTTPS for the backend and trusted web origins.

From the `backend` directory, run `npm run auth:setup` once to create the local SQLite schema, then `npm start`. Run setup again when upgrading Better Auth or changing its plugins. Normal requests do not silently apply schema migrations. The configuration endpoint reports unavailable if credentials, configuration, dependencies, database access, or the required schema are missing.

The database contains account and session information. Keep `backend/data/` out of version control and protect/back up the file appropriately. The Node 24 built-in SQLite driver is supported, so no native database package needs to be compiled. This single-process local database is not a deployed production database design.

## Configure the Meta app

Configure Facebook Login in the Meta developer dashboard and register this exact Valid OAuth Redirect URI:

`<BETTER_AUTH_URL>/api/auth/callback/facebook`

This is the backend callback, including for mobile login. The frontend's `/auth/callback` is a separate destination after Better Auth completes authentication. Real phone testing needs a reachable backend and a callback that the Meta app accepts; a phone's localhost points at the phone. Meta dashboard access restrictions and release checks still apply. No Meta app, permissions, account, or deployment is created by this code.

Basic Facebook login requests only `public_profile`. The provider defaults are disabled explicitly; email access is unnecessary for app identity and was rejected by the real Meta app on 2 November. The optional trainer finder can separately request read-only profile-city or managed-Page access after explicit owner action, as described below. There are no publishing, advertising, Marketplace, payment or device-GPS permissions. Facebook may return no email. The library-required email field then uses `<app-scoped-facebook-id>@facebook.placeholder.invalid`, a non-deliverable internal identifier. All Facebook emails remain unverified. Email/password login and email-based automatic account linking are disabled, and there are no email-sending features.

## Frontend contract

`GET /api/auth/config` returns only:

```json
{
  "provider": "facebook",
  "available": false,
  "baseURL": null,
  "callbackURL": null,
  "message": "Facebook sign-in is unavailable. Complete the server configuration and run the authentication setup command."
}
```

`available` means that the local integration is ready to start login. It does not mean that Meta has accepted the credentials or that a person is signed in. No secret is returned. Facebook login routes return 503 when unavailable; the app must show the setup state rather than treating that as authentication success.

Create the client with `createAuthClient` from `better-auth/react`, backend `baseURL`, and `expoClient` from `@better-auth/expo/client`. Native configuration uses `scheme: 'metapet'`, `storagePrefix: 'musepet'`, and `expo-secure-store` storage. The native scheme `metapet://` is trusted by the backend. Use a development build for this fixed native scheme.

Start sign-in with `authClient.signIn.social({ provider: 'facebook', callbackURL, errorCallbackURL })`. Native callback paths can be `/auth/callback`; the Expo plugin converts them into app deep links. Web callbacks must be absolute URLs at a trusted frontend origin, such as `http://localhost:8081/auth/callback`. Follow completion with a fresh `authClient.getSession()`; navigate into the account only when the server returns a session. A canceled browser or callback error must leave the person signed out.

For custom Muse API requests, native clients send the cookie from `authClient.getCookie()` in the `Cookie` header with `credentials: 'omit'`. Web clients use `credentials: 'include'`; JavaScript cannot set an HttpOnly cookie directly. Both clients also send `X-Muse-Owner` with the current verified session's `user.id`. Cookie-authenticated requests require an exact binding before processing pet data, preventing an account change in another tab from attaching a new cookie to the previous owner's records. This header alone never authenticates a request. CORS allows credentials only for exact accepted origins. Web frontend and backend should use the same site in production, since browser third-party-cookie policies can block cross-site cookie authentication.

The backend validates the session against SQLite for live Muse calls. A forged, expired, or revoked session does not authorize the model. The separately configured `MUSE_CLIENT_TOKEN` remains available for existing local development care clients. In `NODE_ENV=production`, shared development tokens cannot authorize Muse chat/check/avatar: a verified Facebook session and matching owner header are required. A token-only caller, including one with an unverified owner header, never gains page-memory or Facebook-data access. When an owner header is supplied alongside a verified Facebook session and development token, the binding must match; the token cannot bypass that account mismatch. Generic provider token/profile API routes remain disabled; Facebook provider tokens stay encrypted in the backend database. The bounded location endpoint below is the only added Facebook read feature. `authClient.signOut()` revokes the current app session. Signing out is separate from revoking Facebook permissions.

## Optional Facebook areas for trainer searches

The trainer finder at `/trainers` reads Facebook data only after a source button is pressed. `GET /api/facebook/location?source=profile|pages` requires a verified Facebook session and matching `X-Muse-Owner`; a legacy `MUSE_CLIENT_TOKEN` never authorizes these reads. The response reports `available`, `permission_required`, `no_location` or `unavailable` and returns bounded coarse-area choices without tokens, street addresses or coordinates.

When access is missing, the follow-up connection button starts Better Auth `linkSocial` for the same verified owner. Profile city requests `user_location`; managed Page locations request `pages_show_list` and `pages_read_engagement`. Basic signup remains `public_profile` only; each optional flow adds only its selected area permissions, without requesting email. The flow returns to `/trainers`; the owner presses a source button again to load cities, so no automatic import occurs after permission consent. Meta app configuration, mode and provider permission requirements still apply. Real owner login, optional grants and live area imports remain unverified.

The screen also supports a manual city. It suggests a trainer type for puppy basics, loose-leash walking or confidence/behaviour, then opens Google Maps or Facebook Page searches containing only area and controlled goal words. These are area searches rather than verified trainer recommendations. Facebook-derived choices stay in owner-scoped screen memory and are not persisted, added to pet records or sent to the Muse model. No GPS service is requested.

## Account-bound pet-page memory

A verified Facebook cookie session plus matching `X-Muse-Owner` permits care chat to retain a bounded private summary for the selected saved `pet.id`. By default, files use `backend/data/memory/<sha256 owner id>/<sha256 pet id>/memory.md`, with hashed identifiers and a fixed filename. An explicit `MUSE_MEMORY_ROOT` selects an absolute, non-filesystem-root base directory for an isolated public demo. `AUTH_DATABASE_PATH` separately selects its private authentication database. Keep the local installation’s data separate; never copy or silently reassign its owners or memory. Basic Facebook scopes are unchanged: this is local app memory and requests no additional Facebook permissions.

Each file contains the latest owner-provided pet profile/goals, at most eight recent owner questions and twenty deduplicated explicit `remember ...` notes, each capped at 500 characters. The total UTF-8 file is at most 16 KiB; oldest questions and then oldest notes are dropped if needed. Assistant replies, actions, approvals, care logs and appointments are excluded. Current fields, including empty care needs/goals, are authoritative over earlier snapshots. Page memory is loaded as unverified data for care calls; historical commands are not new instructions or completed actions. Social-draft requests never read, write or receive it. Guest demo and development-token-only callers cannot access it. A verified owner can store context while using the deterministic demo guide, but that guide does not perform model-based recall.

Use `GET /api/muse/memory?petId=<id>` to view only the current verified owner's selected page: `{ available: true, exists, updatedAt, markdown }`. Use `POST /api/muse/memory/clear` with `{ petId }` to remove that page's profile summary, notes and recent questions: `{ cleared: true }`. Both endpoints require the cookie and owner header, work without a model API key and reject legacy-token authorization. Clearing invalidates in-flight writes for that page. Chat returns `memory: { enabled, saved }`; callers must use the saved result rather than assume persistence from a successful reply.

Memory survives backend restarts for the same verified owner and pet ID. Signing out revokes the session but does not delete the file. Keep `backend/data/` excluded from source and archives and protect/back up it alongside the authentication database. Atomic file replacement, link rejection and in-process ordering support one local backend process; a deployed multi-instance service needs a shared database/locking and a separate retention/backup design. Real owner login, optional permission grants and live persistent recall are still unverified. Automated auth and memory tests use checked temporary databases/files and stub responses only.

## Validation

`npm test` covers unavailable configuration, schema readiness, authorization state creation, exact redirect and origin checks, cancellation, forged callbacks, signed/forged/revoked sessions, and Node HTTP integration. Tests use disposable databases and stub model responses. They do not use real Facebook credentials or create external accounts. Completing a real Facebook login still requires the configured Meta app and a real owner-driven login.

## Official references

- [Meta manual Facebook Login flow](https://developers.facebook.com/documentation/facebook-login/guides/advanced/manual-flow)
- [Better Auth Facebook provider](https://better-auth.com/docs/authentication/facebook)
- [Better Auth Expo integration](https://better-auth.com/docs/integrations/expo)
- [Better Auth Node handler usage](https://better-auth.com/docs/integrations/express)
- [Better Auth SQLite driver](https://better-auth.com/docs/adapters/sqlite)
- [Better Auth providers without email](https://better-auth.com/docs/concepts/oauth#handling-providers-without-email)

## Observed app configuration blocker — 2 November

The actual browser flow for Datamatrix_HubSA (App ID2139588153438351) first rejected the email permission. Better Auth is now configured with `disableDefaultScope: true, scope: ['public_profile']`; the library’s plural `scopes` option had not overridden its defaults. Tests assert the actual initial and optional permission URLs never add email.

The next actual request reached Facebook Login for Business and reported that this app needs a supported permission. A read-only review of its Use cases → Add use cases list found ordinary Facebook authentication unavailable, with Meta advising a new app for unavailable use cases. Do not add business/Pages permissions just to bypass this mismatch. An owner-selected ordinary Facebook Login-capable app and exact backend callback are needed before the real round trip can pass. No Meta dashboard configuration, new app, credentials or terms were changed during these checks.

## Dedicated login app created — 2 November

The owner approved the separate ordinary Facebook Login app and its displayed creation terms. Meta rejected “Meta Pet” as a registered app name containing “meta”, so the registered app is **Petaverse Login**, App ID **947230411546979**. The product remains Meta Pet, its companion Muse Pet, and its ecosystem Petaverse. Earlier preparation used an unlinked draft; the owner-completed creation flow linked the business portfolio. It was not silently detached.

Basic public_profile is Ready for testing. The exact local callback http://localhost:8787/api/auth/callback/facebook was saved. The dashboard validator previously reported it invalid, but the fresh actual request with the new matched credentials reached Facebook's basic-profile consent screen. This is not a completed callback or verified account session.

The matching App ID and App Secret were saved directly through a reviewed one-use local form, without returning the secret to chat. The backend restarted and health returned 200. BETTER_AUTH_SECRET, AUTH_DATABASE_PATH, the auth database and private memory were preserved. The real Keep the existing local pet’s profile choice, sign-out and return test remain pending. App-scoped IDs can differ: never silently reassign another owner’s profile or memory.

The public origin https://petaverse-meta-pet-demo.vercel.app now uses the connected frontend with same-origin /api and /health routed to one supervised backend through an approved HTTPS tunnel. Its exact Facebook callback is https://petaverse-meta-pet-demo.vercel.app/api/auth/callback/facebook. Real public_profile-only sign-in completed, followed by synthetic pet setup, a live Muse reply and saved server memory. App sign-out denied access to the memory screen; same-account sign-in restored the same device-local pet profile and the original server-memory question/sequence1. No cross-device profile sync or public avatar-generation result is claimed.

The owner-approved Tester invitation is pending acceptance; T’s own account flow remains to be tested after acceptance. The computer, backend and temporary tunnel must remain running. If the tunnel address changes, update the Vercel API rewrite while retaining the stable public callback. Production requests use verified-owner care/avatar quotas rather than sharing one proxy socket quota; unverified forwarded IP headers are ignored.

Tester acceptance: while signed into the invited Facebook account, open https://developers.facebook.com/settings/developer/requests/ and accept the Petaverse Login Tester invitation. The route was verified through Meta’s Developer settings → Requests navigation; T’s own request list and acceptance were not accessed.
