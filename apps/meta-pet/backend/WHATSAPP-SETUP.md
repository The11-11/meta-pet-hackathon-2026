# WhatsApp pet alerts: implementation and activation

Verified implementation: 3 November 2026. The integration is disabled until the private server settings are complete. No WhatsApp delivery has been verified or claimed. Existing device-local phone reminders remain a separate feature. The collar remains a concept.

## Current external blockers

The owner authorized a Meta WhatsApp test-number setup. The Datamatrix_HubSA dashboard now shows the provisioned test sender and WhatsApp account. No token has been generated, no recipient has been added, and no message has been sent. The included order-confirmation sample template is unsuitable for pet alerts and is not accepted by this adapter.

The actual Meta dashboard's Configure Webhooks panel states that an unpublished app receives dashboard test webhooks only, with no production data even from app administrators, developers or testers. The current app is unpublished. A dashboard test event does not prove control of a user's real recipient number and must not be substituted for the signed inbound START pairing. Resolve the app's publication requirements and obtain the owner's approval before publishing; this implementation does not publish anything.

## Smallest real end-to-end test

1. Prepare the exact utility template below and obtain Meta approval for the chosen name and language. Configure only that approved template, never the order-confirmation sample.
2. Prepare a private Cloud API access token with the sender/WABA access needed for `whatsapp_business_messaging` and `whatsapp_business_management`. Use the actual WhatsApp app secret, a separate random webhook verification token, and a separate random 32-byte encryption key. Do not paste these into chat, client settings, the frontend, source control or submission archives.
3. Put the SQLite file outside public assets, deployment output and source archives. Keep its encryption key stable and backed up separately. The alert store must be separate from development owner records and from any other environment's alert database.
4. Run the Node 24+ backend continuously on durable storage. The current queue is a SQLite queue with a 30-second polling worker in this backend process; deploying the frontend alone does not run it. A temporary tunnel also depends on this computer staying on. A stateless function's temporary filesystem is unsuitable.
5. Configure the public HTTPS `/api/whatsapp/webhook` callback, complete its verification handshake, subscribe to `messages`, and verify the app's subscription to the configured WhatsApp account. Resolve the unpublished-app webhook restriction before relying on real inbound messages. When using Meta's test sender, add and verify the owner's chosen test recipient through Meta's current setup flow; adding a recipient does not replace this app's consent pairing.
6. With the owner's approval for a real test, enable the configured server. In Meta Pet, sign in, choose appointment and/or walk alerts, explicitly opt in, open the generated WhatsApp link and send its `START <code>` message from the intended recipient number. Return to Meta Pet and refresh. Only a valid signed inbound message matching the configured WABA and sender phone ID can make the connection active. The code expires after ten minutes and is single use.
7. Explicitly choose a saved future appointment or walk in Meta Pet and schedule its WhatsApp reminder. There is no automatic upload or synchronization of existing local reminders. Confirm `scheduled`, then provider `accepted`, then a signed `delivered` webhook and the actual phone receipt. Provider acceptance is not delivery. Test STOP and confirm that remaining queued reminders are cancelled and the connection is removed. No message may be sent without this separate real-test authorization.

## Exact reminder template

Choose a meaningful pet-reminder template name and one language. Use category **UTILITY**, one text **BODY** component, positional parameters, and no header, footer or buttons for this bounded first integration:

> Meta Pet reminder for {{1}}: your requested {{2}} is planned for {{3}}. Open Meta Pet for details. Reply STOP to stop.

Parameter order is (1) pet name, (2) the fixed word `appointment` or `walk`, (3) event date/time with the selected IANA time zone. Use synthetic example values during template review. The adapter verifies the configured name, language, `APPROVED` status, `UTILITY` category and exact body before acknowledging a schedule and again before dispatch (cached for up to 60 seconds). It rejects unrelated three-parameter templates. All outbound reminders use this template, including inside the 24-hour service window. There is no free-form or marketing fallback.

## Server settings (names only)

| Setting | Purpose |
| --- | --- |
| `WHATSAPP_ENABLED` | Exactly `true` to enable new pairing, scheduling and outbound sending; defaults off. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA whose template and webhook events are accepted. |
| `WHATSAPP_PHONE_NUMBER_ID` | Sender phone-number ID; distinct from the visible sender number. |
| `WHATSAPP_SENDER_NUMBER` | Public business sender digits used by the `wa.me` pairing link. |
| `WHATSAPP_ACCESS_TOKEN` | Private Cloud API token with appropriate messaging and template-management access. |
| `WHATSAPP_APP_SECRET` | Private secret of the app receiving WhatsApp webhooks, used for HMAC verification. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Separate random 32–256-character URL-safe challenge token. |
| `WHATSAPP_GRAPH_VERSION` | Supported version verified in the actual Meta setup; the current dashboard sample shows `v25.0`. |
| `WHATSAPP_TEMPLATE_NAME` | The approved exact pet-reminder template's name. |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Exact approved language code. |
| `WHATSAPP_DATABASE_PATH` | Absolute path to the private durable SQLite file, never a drive root. |
| `WHATSAPP_DATA_ENCRYPTION_KEY` | Separate private 32-byte key encoded as 64 hex characters. |

Changing `WHATSAPP_ENABLED` requires restarting this backend. Existing stored connections and queues remain visible and revocable while outbound is disabled if the private database path and key remain valid. Cancel/disconnect do not require a working sender token. With valid webhook identity, signed STOP messages continue to revoke while disabled; new START messages are ignored. Do not remove the store/key/webhook identity merely to disable sending: retaining them permits revocation. If the store is inaccessible, restore access before changing saved alerts; the app does not claim a successful disconnect.

## API contract

All responses use `Cache-Control: no-store`. Protected endpoints require a real Facebook session and matching `X-Muse-Owner`; preview bearer tokens cannot access them.

| Endpoint | Contract |
| --- | --- |
| `GET /api/whatsapp/config` | Public, bounded readiness: enabled/configured/available/status/message. `configured` means server settings have valid shape; it does not prove token validity, template approval, publication or delivery. |
| `GET /api/whatsapp/status` | Protected readiness + connected, masked recipient label, selected scope, pending expiry and at most 50 owned reminders. Does not expose recipient numbers or pairing codes. |
| `POST /api/whatsapp/pair` | `{consent:true,appointmentAlerts:boolean,walkAlerts:boolean}`; at least one scope true. Returns only the short-lived `https://wa.me/<sender>?text=START%20<code>` and expiry. No arbitrary destination field. Five pair requests per ten minutes per owner. |
| `POST /api/whatsapp/disconnect` | Clears saved recipient ciphertext/hash/label and scope, invalidates pending pairing, cancels queued jobs. An already dispatched message cannot be recalled. |
| `POST /api/whatsapp/reminders` | `{petId,clientReminderId,petName,kind,eventAt,leadMinutes,timeZone}`. `kind` is appointment/walk; lead is 0/15; IDs use 1–100 ASCII letters/digits/underscore/hyphen; pet name is 1–80 characters without controls. Event must have an explicit offset, be over five seconds in the future and within 366 days. |
| `POST /api/whatsapp/reminders/cancel` | `{id:<64 lowercase hex>}`. Cancels an owned queued reminder; returns an honest conflict if it is already sending. |
| `GET /api/whatsapp/webhook` | Validates `hub.mode`/separate verify token and returns the raw unquoted challenge. |
| `POST /api/whatsapp/webhook` | Maximum 256 KiB; verifies `X-Hub-Signature-256` over exact raw bytes with the app secret before JSON parsing; checks WABA, phone ID and product before processing. No response message is sent. |

Schedule identity is `(owner,petId,clientReminderId)`. Identical requests reuse the saved result. Accepted/in-flight/unknown reminders cannot be silently replaced or resent. Changed future queued or terminal reminders may be explicitly rescheduled within the active limit. A 15-minute lead uses the event time when the lead has already passed. This is a reminder system, not an emergency or exact-time guarantee; the worker polls every 30 seconds and expires missed reminders rather than sending stale alerts.

States are `scheduled`, `sending`, `accepted`, `sent`, `delivered`, `read`, `failed`, `delivery_unknown`, `cancelled`, `expired`. A provider error or network interruption after POST may be ambiguous: `delivery_unknown` is never automatically resent. Known retryable readiness/rate-limit failures have at most three attempts and a timeliness bound. Interrupted send leases also become unknown. Recipient consent is checked again after awaited template readiness immediately before POST; STOP/disconnect received during that wait prevents dispatch.

The queue contains minimal pet name/type/time data, owner/pet/reminder IDs, consent version and provider state. Recipient numbers are AES-256-GCM encrypted and matched through keyed hashes. No health notes, session tokens or message transcripts are queued. Terminal reminders are pruned after 30 days; webhook dedup/status rows after 14 days. Retention cleanup runs with the worker. Logs and API errors do not include upstream response bodies or secrets.

## Verified scope

Eighteen focused backend tests pass using disposable identities, in-memory/temporary SQLite, mocked Graph responses and local HTTP only: raw signatures/tenant binding, one-use expiry, consent/owner isolation, exact template, persistent queue, clock-independent idempotency, status transitions, cancellation/STOP, disabled-state revocation, retry/ambiguity, stale expiry and the post-await consent race. Run `node --test backend/test/whatsapp.test.mjs` from the canonical app. This is implementation evidence, not a real WhatsApp send or phone/device delivery test.

## Primary references

- [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/): opt-in, opt-out and template purpose; approved templates outside the 24-hour service window. Do not promise free messages.
- [Meta WhatsApp developer hub](https://whatsappbusiness.com/developers/developer-hub/): official platform and test resources.
- [Meta-maintained messaging sample](https://github.com/fbsamples/business-messaging-sample-tech-provider-app): messaging/management permissions and account subscription patterns.
- [Meta sample signed webhook handler](https://github.com/fbsamples/business-messaging-sample-tech-provider-app/blob/main/app/api/webhooks/route.ts): exact raw-body HMAC using the app secret and the separate GET verification token. This integration requires verification, omits sample logging and never treats the two secrets as interchangeable.
- [Official Meta messages collection](https://www.postman.com/meta/whatsapp-business-platform/folder/o48mro7/messages): sender-ID message endpoint and provider message IDs.
- [Official Business App / Platform connection guidance](https://whatsappbusiness.com/resources/resource-library/organize-whatsapp-inbox-meta-business-suite/): same-number coexistence exists. Verify account eligibility and the actual supported onboarding path before connecting an existing business number; do not automatically deregister or migrate the owner's Business App.
- App-specific publication/test-sender findings above come from the owner's actual Meta developer dashboard on 3 November 2026; they are not inferred from a successful synthetic webhook test.
