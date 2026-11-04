# Meta Pet submission copy

## Verified 4 November checkpoint

The source checks passed **325/325 tests, TypeScript and lint** again on **4 November**. Deployment **dpl_5CHiMHtuesbnsRuBCNpisT2Mqp7R** is the restored public configuration; its 55 frontend files are byte-identical to the 3 November integration release. Only the temporary API tunnel rewrite configuration changed.

The earlier 4 November API outage was resolved. At **13:10 SAST**, public checks verified a healthy live/auth-required API, the exact Facebook callback, disabled WhatsApp, rejected anonymous/forged private requests and no-store responses. At **13:11 SAST**, browser reload retained the existing verified Facebook session and synthetic profile; WhatsApp refresh remained disabled, and an explicit Meta connection test succeeded without pet records. This was an existing-session connectivity check, not a fresh OAuth or native-device test.

The accepted-participant form has now been inspected. It requires a **Public GitHub Repository** URL and a **3-Minute Demo Video** link, plus the named project, track/theme, Meta-use and required opinion fields mapped in [FORM-MAPPING.md](FORM-MAPPING.md). The organizer announcement explicitly says GitHub must be open source. No APK/file-upload field was observed. Exact server-side character limits and additional video editing/hosting constraints were not shown.

A **4 November source ZIP is under preparation after freeze**. A new three-minute captured-steps video is also being prepared. The earlier 3 November source snapshot and 90-second video remain unchanged history; local files do not fulfill the required public GitHub/video URL fields. Indie Developer Track and Build for Your World are reversible portal drafts, and the owner supplied Very likely for future API use. The owner confirmed Thomasanderson11 as the sole entrant, Very likely for future API use and Very favorable overall opinion. Optional personal surveys remain blank. Repository/licence publication, video hosting and final permission/Submit approval remain pending.

Refreshed **4 November 2026** after the actual accepted-participant form was inspected. [FORM-MAPPING.md](FORM-MAPPING.md) contains exact field drafts, including the earlier-work disclosure inside Project Description. Public GitHub and three-minute video URL fields are required; final owner choices, consent and submission remain pending.

## Project name

Meta Pet

## Short pitch

Meta Pet turns everyday pet-care notes into useful next steps. Muse Pet, its AI companion, uses Meta models to help owners plan care, review suggested actions and retain useful context for each pet.

## Project description

Pet care happens in small moments: a meal, a walk, a training session or a note for the next vet visit. Those details are easy to scatter across chats, calendars and memory.

Meta Pet brings them into one app. Owners create a pet profile, choose care goals and record observations. Muse Pet uses that context to ask better questions, help plan routines and prepare care entries or appointments. The owner reviews each proposal before saving it. A suggestion never becomes a completed care task by itself.

Meta’s Muse Spark powers live guidance and structured proposals. Muse Image can create a custom companion portrait from a selected image. Verified Facebook accounts can retain bounded private Muse page memory per pet, with owner review and clearing. Full care timelines remain on the device.

Meta Pet is the app, Muse Pet the companion and Petaverse the wider ecosystem. The demonstrated prototype focuses on useful care, owner control and a reliable return journey.

## Problem and intended benefit

Owners need a simple way to keep care consistent without explaining their pet from the beginning each time. Muse works from the profile, preferences and recorded care, then asks for missing details instead of inventing a history.

The intended benefit is less repeated explanation and a clearer next step. Adoption, time saved and animal-health outcomes have not been measured.

## Meta AI use

- Muse Spark 1.3 provides live pet-care guidance and validated structured proposals through a server-side Meta Model API adapter.
- Muse Image 1.0 generates companion portraits from a selected image. Real pet-photo generation passed in the local prototype. The 3 November public Facebook-authenticated test used nonprivate project artwork; generation, explicit selection and reload persistence passed. It was not a public real pet-photo test.
- A separate local development workflow uses multiple Meta model calls for planning, specialist consultation, patch proposals and independent review. Applying a patch is a separate explicit local action. Public pet chat has no repository, computer or deployment privileges.

Facebook Login identifies the owner. It is separate from model inference and does not grant Marketplace listing access or social publishing.

## Technical approach

The mobile-first app uses Expo SDK 57, React Native, TypeScript and Expo Router. The Node backend keeps provider credentials server-side, verifies Facebook sessions, bounds context and validates model proposals.

Care records, appointments and chat history are scoped to each account on the device. Private server memory is separately scoped to the verified owner and pet page. Review, approval and persistence checks keep unapproved suggestions separate from saved records.

The Vercel frontend routes a same-origin API to an isolated backend through an approved temporary HTTPS tunnel. This is a supervised demo requiring the host computer and services to remain running.

## Verified core journey

The 2 November public test completed real owner Facebook sign-in, a synthetic pet setup, a live Muse reply, private memory review, sign-out and same-account return. The profile and saved server memory returned in the same browser and origin.

The 3 November public rehearsal generated and retained an avatar from nonprivate sample artwork. Muse declined to invent a completed demonstration walk, leaving past-care records at zero. After explicit owner approval it saved one local DEMO CHECK-IN appointment note scheduled for 4 November at 09:00 SAST. That time is now past; the evidence verifies proposal, approval and saved-note persistence, not a veterinary booking or notification delivery.

The later **3 November source checkpoint passed 325 automated tests, TypeScript and lint**. Deployment **dpl_HA9ZbfHe8KxvSHTHpbS33hFH8Ajo** was READY; its public browser check confirmed the updated bundle and honestly disabled WhatsApp status. Physical-device behavior and independent tester completion remain unverified.

## Supporting features and integration status

Supply and trainer tools open controlled searches for a selected area and goal. Listings, suitability, prices and availability are not verified recommendations. Social pages hold plans and approved caption drafts; the app does not publish them.

WhatsApp reminder infrastructure and Settings are implemented but disabled and unconfigured. A Meta test number was created on 3 November; business verification/publication and further setup remain pending by the owner’s decision. No recipient pairing or delivered message has been verified.

Native source includes blocked-camera settings recovery, foreground notification-permission handling and account-bound Facebook completion. Android/iOS bundle exports passed; installers, physical camera behavior, OAuth return and notification delivery remain untested.

Collar, camera and feeder hardware are concepts. Real purchases, payment/catalog accounts, crypto assets/wallets, Marketplace payments and social publishing remain unconnected.

## Next development

Complete independent reviewer access and testing, then move the supervised backend to persistent hosting. Verify a permissioned real pet photo on the public path if that claim is needed, and test signed native builds on physical devices. Resume WhatsApp production setup only when the owner chooses to do so.

## Earlier-work disclosure

An earlier local prototype began on **22 October 2026**, before kickoff. It included the initial app, local care records, onboarding, companion artwork and saved conversations, followed by initial live Muse, avatar and social-draft work verified on 25 October.

During the event period, the project expanded with pet-specific context and specialist routing, controlled Marketplace searches, local development coordination, trainer discovery, private per-account pet-page memory, profile-handoff safeguards, interactive Muse guidance and the public Facebook-connected demo. Later device-permission safeguards and disabled WhatsApp infrastructure are recorded separately from demonstrated delivery.

Original records are retained. This entry includes earlier prototype work and should not be described as built entirely from scratch during the event. Provide any further breakdown required by the actual form.

## Links and artifacts

Demo: https://petaverse-meta-pet-demo.vercel.app

The form requires a Public GitHub Repository URL and a 3-Minute Demo Video link, with a YouTube URL placeholder. The organizer announcement says GitHub must be open source. Neither public link has been prepared or published by this documentation task. No installable-build/file-upload field was observed. Local filesystem paths are not public review links.

The earlier 3 November source ZIP and 90-second captioned evidence video remain unchanged snapshots and do not contain the later integration. The older video assembles captured steps and is 90 seconds; it does not match the now-observed three-minute label. A new three-minute version is being prepared. Additional continuous-recording/editing rules were not observed. Prepare updated artifacts after the final source/documentation freeze if the chosen deliverable requires them.

## Preserved checkpoint — earlier 3 November release

Deployment **dpl_BJeuQCSC37q5mh8bnquz4KYMew68** passed **282 tests**, TypeScript, lint and public setup/API checks. Same-account Facebook return restored the demonstration profile, avatar and approved appointment with zero invented past-care records. The 2 November 276-test checkpoint is also preserved. These historical counts do not replace the later 325-test source checkpoint.

No entry was submitted by this documentation work. The owner’s status outside this work remains unknown.
