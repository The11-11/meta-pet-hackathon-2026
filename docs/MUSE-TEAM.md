# Muse Pet team and pet product discovery

Current implementation guide: **28 October 2026**. Meta Pet is the app, Muse Pet is its AI companion, and Petaverse is the wider ecosystem. This guide describes the current additions without replacing the original **22 October 2026** development history or changing any required disclosure about earlier work.

## What the team does

Muse Pet has a registry of **16 authored specialist roles**: six for pet owners and ten for development, hackathon review and planning. The pet-facing chat selects one instruction module for **one request to the existing Meta Responses API**. Individual development consultations also use one request. The additional local development coordinator delegates to specialists through **separate bounded Meta requests**, combines their findings and can produce an independently reviewed patch proposal. None of these paths trains model weights or inherits running Codex sessions. The Meta provider and server-side key arrangement are unchanged.

The mobile adapter remains a bounded proposal harness. Its care-entry, appointment and social-draft proposals require the owner's review and approval before local saving. A specialist capability label does not itself grant a tool, account, file or service permission. The separate Eve foundation remains in place; the mobile route does not gain Eve durable sessions or background workers from this registry.

Implementation sources:

- [Role manifest](../apps/meta-pet/backend/agent/team/manifest.json): versioned roles, audiences, descriptions, scopes, capability labels and instruction paths.
- [Registry and routing](../apps/meta-pet/backend/agent/team/index.mjs): validation, fixed pet routing and development request construction.
- [Shared Muse instructions](../apps/meta-pet/backend/agent/instructions.md), [pet specialist policy](../apps/meta-pet/backend/agent/team/pet-policy.md) and [development consultation policy](../apps/meta-pet/backend/agent/team/development-policy.md).
- [Development CLI](../apps/meta-pet/backend/scripts/team.mjs) and [mobile adapter](../apps/meta-pet/backend/src/muse.mjs).

## Available roles

Pet-facing roles are selected from the current request. A `social_draft` task selects the social role. Otherwise health concerns take precedence, followed by product searches, nutrition, routines/training, social requests and everyday care. Previous messages, saved care notes and caller-supplied specialist IDs cannot select a development role.

| Pet role ID | Role | Scope |
| --- | --- | --- |
| `general` | Everyday pet care | Practical care questions, missing information and record summaries. |
| `nutrition` | Nutrition | Feeding records, diet routines and questions to discuss with a veterinarian. |
| `routines-training` | Routines and training | Reward-based practice, activity, enrichment, rest and routine records. |
| `health-guidance` | Health guidance | Owner observations, veterinary questions and appointment preparation, without diagnosis or treatment. |
| `marketplace` | Pet product finder | Product criteria and owner-opened Marketplace searches. |
| `social` | Pet social drafts | Page plans, bios and captions for owner review. |

Development roles are available through explicit local CLI consultations or the bounded local coordination workflow. Eight retain the original helper identities as `sourceAgentIds`; these identifiers record provenance, not active connections or inherited conversations.

| Development role ID | Role | Original source identity |
| --- | --- | --- |
| `check_kickoff_updates` | Hackathon updates reviewer | `check_kickoff_updates` |
| `facebook_readiness_review` | Facebook readiness reviewer | `facebook_readiness_review` |
| `candid_prize_assessment` | Prize assessment reviewer | `candid_prize_assessment` |
| `check_build_dates` | Development history reviewer | `check_build_dates` |
| `distinctive_repair_demo` | Distinctive demo reviewer | `distinctive_repair_demo`; the original FixLens-era identity is retained. |
| `hackathon_fit` | Hackathon fit reviewer | `hackathon_fit` |
| `hackathon_update_baseline` | Hackathon baseline reviewer | `hackathon_update_baseline` |
| `independent_hackathon_choice` | Independent product reviewer | `independent_hackathon_choice` |
| `build-review` | Build reviewer | New authored role; no source agent identity. |
| `project-planning` | Project planner | New authored role; no source agent identity. |

## Use the development helpers

Run these commands from `apps/meta-pet/backend/`.

List the roles without loading `.env`, reading credential values or contacting a provider:

```sh
node scripts/team.mjs --list
```

The equivalent package alias is `npm run team:list`.

To request live read-only advice, choose a development role and provide the exact context and question to send:

```sh
node --env-file-if-exists=.env scripts/team.mjs --specialist project-planning --message "Given this supplied status: the welcome screen works and Facebook sign-in is pending. Propose the next three reviewable steps."
```

The package alias accepts the same explicit arguments:

```sh
npm run team:consult -- --specialist build-review --message "Review this supplied implementation excerpt and identify likely regressions: ..."
```

A consultation uses the existing private `MODEL_API_KEY` and optional `MODEL_NAME` from the backend. Never paste a key, password, token, unredacted private configuration or owner records into the consultation message. The message must contain 1 to 4,000 characters. Only the authored instructions and that message are sent to Meta, with provider storage disabled. Model inference still transmits that content to Meta.

The development helper has **no tools**. It does not automatically read the repository, browser, private environment contents, previous chats or owner care records. It cannot run a shell, test code, save files, browse announcements, sign in, change settings, contact anyone, publish, submit an entry, buy products or schedule work. It returns advice and proposed steps for a person or authorized coding session to review. Function calls are rejected, and provider failures remain errors. Consultations do not replace the separate hackathon monitoring automation.

## Coordinate maintenance and feature work

The local development coordinator now makes **separate, real Meta model calls**. It is available through the developer CLI, with no development endpoint added to the public pet chat. The pet-facing path still selects one role in one request; coordination is an additional workflow for maintaining the project.

Patch mode follows this sequence:

1. A planner breaks the supplied request into acceptance criteria and one to three tasks assigned to existing development roles.
2. The selected specialists receive separate requests in parallel and return findings, risks and suggestions from the supplied source snapshots.
3. A builder receives the actual findings and proposes complete replacement text for a small set of explicitly named files.
4. A separate build-review request compares the exact proposal with the source and acceptance criteria. Its result is either ready for operator review or changes requested.
5. The local harness saves the plan, report, replacement manifest and readable diff. It has not applied code or run checks.

Plan mode stops at a combined implementation plan after the specialist consultations and a synthesis request. Patch mode makes at most **six model calls**; plan mode makes at most **five**. Both allow at most three parallel specialist consultations, a 120-second overall budget and a 25-second limit per provider request. Invalid roles, malformed JSON, unfinished responses, refusals, unsupported action output or a failed consultation stop later stages. Receipts distinguish completed and failed calls; no unexecuted check is reported as passed.

Run the following from `apps/meta-pet/backend/`. Each `--file` is relative to the canonical **app** directory, not the backend directory. Repeat `--file` for every source file the model may inspect or propose to change.

```sh
npm run team:coordinate -- --mode plan --request "Review the supply finder and propose two maintainability improvements." --file src/marketplace.ts
```

To generate a proposed patch, choose patch mode and explicitly name every existing or new file:

```sh
npm run team:coordinate -- --mode patch --request "Make this supplied module easier to maintain while preserving its behavior." --file src/marketplace.ts --file src/new-feature.ts
```

A missing file can be named deliberately when its parent directory already exists. Its snapshot records that it was absent. The builder cannot invent an additional path or create arbitrary folders. Supply only source material intended for Meta inference; the coordinator sends the explicit request and bounded snapshots with provider storage disabled.

Preview the selected paths, hashes and sizes without contacting Meta or reading credential values in the command:

```sh
node scripts/coordinate.mjs --dry-run --request "Review the supply finder." --file src/marketplace.ts
```

The coordinator accepts at most **eight explicit files**, at most **64 KiB per existing file**, and at most **160 KiB of combined snapshot context** including the engine's JSON envelope. It proposes at most five changed files and at most 96 KiB of replacement text. Source extensions are limited to JavaScript, TypeScript and stylesheet files under authored source prefixes. Environment and private settings, authentication files, policy/instruction files, generated directories, source-control metadata, symbolic links/junctions, the coordinator itself and the specialist-team configuration are blocked. Package/configuration changes and changes to these protected paths remain separate reviewed coding work.

Local artifacts are saved beneath ignored `backend/data/coordination/`, in a unique run folder. They include `plan.json`, `report.json`, `changes.patch` and `patch-manifest.json`. The manifest contains baseline snapshots and replacement hashes. Keep these artifacts private: they contain the explicit request and source context. An optional `--output-dir` must remain beneath that same directory; it is resolved from the canonical app root.

The report distinguishes `plan_only`, `review_required`, `changes_requested` and `failed`. A model verdict of `ready_for_review` is **not owner approval**. Read the plan, report, readable diff and exact replacement manifest before choosing whether to apply it.

Applying is a separate local action and loads no model credentials or generated commands:

```sh
npm run team:apply -- --artifact "backend/data/coordination/RUN_ID/patch-manifest.json" --approve "EXACT_REVIEWED_MANIFEST_SHA256"
```

Replace the placeholders with the saved manifest path and the SHA-256 identifying the exact manifest reviewed. Apply refuses altered artifacts, unresolved review findings, stale source hashes and a new-file path that now exists. It checks every original snapshot before writing, journals attempted replacements, and restores attempted changes after a write error. A failed rollback is reported for operator attention. An applied run still reports `checksExecuted: false`; lint, typecheck and the relevant test suite must be run by the authorized developer after reviewing the resulting code. The harness never runs a model-provided command, deploys, publishes, signs in or edits private configuration.

This is guarded local coordination and file handling, not an operating-system sandbox or an autonomous background maintenance service. The development workers are separate model requests using the existing Meta provider; they do not inherit this chat's Codex sessions, computer tools or credentials. The separate Eve foundation remains available for a future deliberate runtime integration.

Implementation sources: [coordinator](../apps/meta-pet/backend/agent/coordination/coordinator.mjs), [workspace and apply guards](../apps/meta-pet/backend/agent/coordination/workspace.mjs), [coordinate CLI](../apps/meta-pet/backend/scripts/coordinate.mjs), and [explicit apply CLI](../apps/meta-pet/backend/scripts/apply-coordination.mjs).


## Pet-specific guidance and privacy

The owner can save breed, age and optional **Care needs and preferences** in Settings. Care needs are limited to **500 characters**. Existing onboarding care goals are passed as at most five unique values from `feeding`, `walk`, `training`, `sleep` and `vet`. The backend validates and bounds these fields; it does not accept arbitrary extra profile context.

For ordinary live care questions, Muse receives the relevant owner-provided pet profile, selected goals and bounded care context. It should use species, life stage, known needs and the owner's existing care plan, ask when important details are missing, and distinguish recorded facts from unknowns. A missing care entry does not establish that a meal, walk or other activity was missed. Feeding quantities, exercise targets and health conclusions must not be invented. Training guidance uses rewards and comfortable, gradual practice; health questions are for observation and veterinary escalation, not diagnosis or medication dosing.

The live request still sends included care context to Meta for inference. The adapter does not gain background monitoring, sensor readings or veterinary verification. Profile notes are owner-provided, unverified data, not instructions that can alter tools or specialist permissions.

Separate social drafting excludes breed, age, care needs, care goals, care logs, appointments and prior conversation. The draft context uses the selected local public profile information and the limited pet identity required for the task. Marketplace URLs also exclude names, care notes, diagnoses, appointments, account IDs and location. The current freeform owner message is still sent for the task being requested; do not put private details into a message intended for public copy.

## Marketplace product discovery

[Marketplace search generation](../apps/meta-pet/src/marketplace.ts) creates four product ideas: mealtime bowls, harnesses or carriers, enrichment toys and washable beds. Selected care goals change their order. The query uses a controlled `dog`, `cat` or generic `pet` term and a controlled product category; it does not interpolate arbitrary profile text.

The owner chooses a search and opens Facebook Marketplace, for example:

```text
https://www.facebook.com/marketplace/search/?query=dog%20harness
```

This is an **owner-opened search link**, not an authenticated Marketplace listing feed or live offer API. Muse has not verified current deals, prices, availability, seller claims or product suitability. Facebook controls its own sign-in, location filters and results. Native Facebook app handoff and device behavior need separate testing. Purchases, messaging sellers and Peta Coin payments are not performed by this addition.

Product cards give buying checks such as fit, closures, species-appropriate size, materials, damage and cleaning. These are criteria for owner review, not a guarantee that a listing is safe. The initial categories avoid animals, medicines, medical devices and veterinary services. The [Meta animal commerce policy](https://www.facebook.com/policies_center/commerce/animals) permits animal-use products such as toys, collars and cages while prohibiting the listed animal and medical categories. [RSPCA product and home guidance](https://www.rspca.org.uk/adviceandwelfare/pets/dogs/environment) supports suitable toys, correct harness fit and cleaning checks.

A future in-app offer feed should use an authorized merchant catalog or other explicitly supported data source, with genuine product URLs, price/currency, availability and a checked timestamp. Meta's [Commerce Platform](https://developers.facebook.com/documentation/ads-commerce/commerce-platform) and [Catalog and Inventory](https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog) documentation describes seller/catalog integration; it does not establish a general buyer-search permission for this app. Do not assume that Facebook Login alone grants Marketplace listing access. Meta's [scraping guidance](https://about.fb.com/news/2021/04/how-we-combat-scraping/amp/) requires permission for automated collection. No scraping, session-cookie replay or private GraphQL integration is included here.

## Add a maintainable specialist

1. Add a role to `backend/agent/team/manifest.json` with a unique valid ID, `pet` or `development` audience, nonempty label/description/scope, capability labels and `sourceAgentIds`. Use source IDs only for actual provenance. Keep `version: 1` and `execution: "instruction_routing"` unless intentionally migrating the registry contract.
2. Create the exact authored instruction file `backend/agent/team/roles/<id>.md`. The manifest's `instructions` value must be `roles/<id>.md`. Keep the role's scope narrow and follow the shared instructions and audience policy. The registry rejects other file paths and empty instruction files.
3. Reuse a capability from the allowlist in `backend/agent/team/index.mjs`. If a new label is necessary, add it deliberately to that allowlist and test it. Labels are descriptive metadata; new tools, credentials, service access or mutations require their own explicit implementation and authorization boundaries.
4. For a pet role, add an explicit selection rule in `selectPetSpecialist` if it should route automatically. Preserve health priority and `social_draft` isolation. Never route from saved notes, conversation history or arbitrary caller role IDs. A development role remains available only through an explicit developer CLI request; the coordinator may select it from the validated development registry, and it must not be exposed to pet chat.
5. Add focused tests for manifest validation, role selection, audience separation, prompt context and any privacy/action boundary affected. Use `backend/test/team.test.mjs` as the registry/CLI reference and the pet-care/client-context/Marketplace tests for those contracts. Test rejected inputs and provider failures as well as a normal path.
6. From the app directory, run the backend test suite, lint and typecheck. Run the backend typecheck if the Eve TypeScript definition changes. Restart the backend after authored instruction or manifest changes because the registry reads them at module load. Then verify the actual affected app or explicit CLI flow with nonprivate test context.

The registry is a checked-in authored add-on system, not a loader for arbitrary plugins, paths, shell commands, credentials or model-provided code. Preserve dependency versions and the existing Meta integration unless a separately reviewed change requires otherwise.

## Verification state

Verified on 28 October 2026: **188 automated tests**, frontend lint and TypeScript, and Android Hermes export to `dist/pet-care-team` passed. At 390 × 844, a synthetic demo profile saved care preferences, reached the supply finder from Muse and opened the controlled Marketplace search. Facebook required sign-in; no live offers were retrieved. A live Meta care reply used the saved training/bedding preferences and stated the Marketplace limits. The local `project-planning` consultation returned live advice with no tools executed.

Browser verification used the separate `127.0.0.1:8083` demo origin and a temporary backend on port 8788; the canonical backend on port 8787 was restarted with the current code. Existing localhost-origin rules, user records and private settings were unchanged. Physical Android/iOS behavior, native Facebook handoff, an authorized Marketplace offer feed, Eve durable/background orchestration and real Facebook authentication remain separate verification or integration work. Full evidence is in `apps/meta-pet/verification.json`.

### Development coordination verification

On 28 October 2026, a live plan run completed **four real Meta calls**: a planner, two parallel specialist consultations and a final synthesis. Its ignored local artifacts are in `backend/data/coordination/2026-10-28T07-20-29-017Z-073003fd-e8d0-40c0-a181-e10733081151/`. Source files were not changed by that run. The earlier 188-test count above records the pre-coordinator feature baseline; it is not a claim about the final expanded suite. The final expanded suite passed **219 tests**, with zero failures or skips; frontend lint and TypeScript also passed. A live patch run completed five actual Meta calls: planning, two parallel consultations, replacement generation and an independent review. Its only proposed change corrected a synthetic reminder helper from OR to AND. The exact reviewed manifest was then explicitly approved and applied to the disposable fixture, and all four boolean behavior checks passed. No generated feature patch was applied to the canonical app. Patch generation itself changed no source and ran no verification commands; the later fixture checks were performed separately by the implementation session.
