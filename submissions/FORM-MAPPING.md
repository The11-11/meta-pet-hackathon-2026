# Meta Pet exact submission-form mapping

Prepared **4 November 2026** from the rendered accepted-participant form at [Cerebral Valley](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit). Root has filled Team Name and the three narrative fields from this mapping, selected the reversible Indie/Build for Your World and Very likely/Very favorable drafts, and confirmed Thomasanderson11 as the sole entrant. Repository and video links remain blank. The permission checkbox remains false and Submit is untouched; no entry has been submitted.

## Confirmed form requirements

The form asks for plain text/URL entries, not file uploads. The Public GitHub Repository and 3-Minute Demo Video fields are marked required. The organizer announcement explicitly says GitHub must be open source. The video field has a YouTube URL placeholder. HTML maxlength was not set in the inspected fields; that does not establish unlimited server-side acceptance. Exact extra video tolerances, size, editing or hosting constraints were not shown. No particular open-source licence was named in the observed form or announcement. No APK/installable-build field or separate earlier-work field was observed.

The owner confirmed **Thomasanderson11** as the sole human entrant. Kai is the pet subject, not a team member. Indie Developer Track and Build for Your World are reversible drafts; the owner supplied Very likely and Very favorable for the required API questions.

| Field | Requirement | Draft/status |
| --- | --- | --- |
| Team Name | Required | Entered by root; final owner review pending |
| Team Members | Observed | Thomasanderson11 only; owner confirmed complete human roster |
| Which track are you submitting to? | Required | Indie Developer Track selected as reversible draft; final review pending |
| Which problem statement did you build towards? | Required | Build for Your World selected as reversible draft |
| Project Description | Required | Entered by root with earlier-work disclosure; final review pending |
| Public GitHub Repository | Required | public open-source GitHub URL not prepared or published |
| 3-Minute Demo Video | Required | new three-minute captured-steps video in preparation; final reviewable link not published |
| Describe your use of Meta products to build the submitted project | Required | Entered by root; final owner review pending |
| Why are Meta's models important to your solution? | Required | Entered by root; final owner review pending |
| How likely are you to build with Meta Model API? | Required | Owner supplied Very likely; portal draft selected |
| How would you describe your overall opinion of Meta Model API? | Required | Owner supplied Very favorable; portal draft selected |
| By accepting, the submitter(s) grants Meta and Cerebral Valley permission to use, publish, share, and promote the submitted materials across their websites, social media, and other marketing channels. | Observed | untouched; final owner approval required before accepting |

## Team Name

Meta Pet

## Project Description

Meta Pet helps owners turn everyday pet-care observations into useful next steps. Meals, walks, training and notes for the next visit are easy to scatter across chats and calendars. The app brings a pet's profile, preferences and device-local care timeline together. Muse Pet, its AI companion, uses that context to ask for missing details and prepare care entries or future appointment notes. The owner reviews each proposal before saving it; a suggestion does not become completed care by itself.

Meta's Muse Spark powers live guidance and validated structured proposals. Muse Image creates a custom companion portrait from a selected image. Verified Facebook accounts can review or clear bounded private memory for each pet page; full profiles, timelines and chat remain device-local. Public owner sign-in, live replies, avatar generation from nonprivate sample artwork, saved-note approval and same-browser return have dated verification. The public demo is supervised and requires an accepted Facebook tester or owner for live features: https://petaverse-meta-pet-demo.vercel.app.

The current source passed 325 tests, TypeScript and lint on 4 November. Physical-device behavior remains untested. WhatsApp infrastructure is implemented but disabled and unconfigured; no delivery is verified. Hardware, real payments, cryptocurrency and social publishing remain future integrations. Meta Pet is the app, Muse Pet the companion and Petaverse the wider ecosystem. Adoption, time savings and animal-health outcomes have not been measured.

Earlier-work disclosure: the local prototype began on 22 October 2026, before the 26 October kickoff, with the initial app, local care records, onboarding, artwork and saved conversations, followed by initial live Muse, avatar and social-draft work. During the event it expanded with pet-specific context, reviewed actions, controlled discovery, private per-pet account memory, handoff safeguards, interactive guidance and the public Facebook-connected demo. Original development and verification records are retained.

## Describe your use of Meta products to build the submitted project

Muse Spark 1.3 provides live pet-care guidance and structured care/appointment proposals through the server-side Meta Model API adapter. The backend bounds profile/history context, validates proposed actions and requires owner review before local persistence. Muse Image 1.0 generates a companion portrait from a selected image; the public demonstration verified nonprivate project artwork, explicit selection and reload persistence. Earlier local generation used an approved pet photo.

Facebook Login identifies the owner and protects per-owner/per-pet private page memory. It does not provide social-publishing or Marketplace permissions. The public demonstration verified same-browser profile and saved-memory return. A separate local development coordinator uses multiple Meta model calls for planning, specialist consultation, proposed patches and independent review; applying a patch requires a separate explicit local action. Public pet chat has no code-maintenance privileges. No Fireworks, Modal or Baseten usage is claimed without owner confirmation.

## Why are Meta's models important to your solution?

Muse Spark makes the companion useful beyond a fixed checklist: it can interpret an owner's natural-language question alongside a bounded pet profile and recorded context, ask for missing details, and propose structured next steps for review. The application supplies current context and remembered preferences, validates the output and keeps the owner in control of saving actions.

Muse Image adds a personal visual companion from an owner-selected reference. Together these Meta model capabilities support the demonstrated journey from pet setup to context-aware guidance, a reviewed local plan and a reliable return. These are verified functional benefits; we have not measured health outcomes or claimed that Meta models outperform other providers.

## Owner choices and final approval

- **Track:** Indie Developer Track is selected as a reversible portal draft following the recommendation. Final owner review remains pending.
- **Problem statement:** Build for Your World is selected as a reversible portal draft for the everyday pet-care journey.
- **Roster:** Thomasanderson11 is the sole human entrant, confirmed by the owner. Kai is the pet subject, not a team entrant.
- **Likelihood of building with Meta Model API:** the owner supplied Very likely, and that reversible portal draft is selected.
- **Overall opinion of Meta Model API:** the owner supplied Very favorable, and that reversible portal draft is selected.
- **Public repository and licence:** public URL unprepared; obtain explicit approval before publishing source or choosing a licence.
- **Three-minute video:** new captured-steps version in preparation; final review and hosting/link still needed.
- **Permission checkbox:** grants Meta and Cerebral Valley permission to use, publish, share and promote submitted materials. It remains untouched for final owner review.
- **Submit:** untouched. Review the exact finished form and approvals before that action.

## Optional questions

The Most Viral X-post link and partner feedback fields are optional in the observed form. No X link or verified Fireworks/Modal/Baseten experience has been supplied for this build. Leave them blank unless the owner supplies truthful answers.

The following optional questions are personal/team experience and should not be filled with invented ratings:

- How likely are you to recommend the Meta Model API to another developer or engineering team building with LLMs?
- How likely are you to recommend Muse Code to another developer or engineering team?
- What was the biggest obstacle your team hit while building this project?
- Compared with other AI models your team has used for the same kind of work, how did Meta’s models perform on this project?
- When your team chooses an AI model or coding tool, what matters most?
- What makes it hardest for your team to switch to a different AI model or coding tool?
- If your team took this project to production, what would most likely stop you from using Meta’s models?

## Artifact and evidence boundaries

The 4 November code checks passed 325/325 tests, TypeScript and lint. Restored configuration deployment **dpl_5CHiMHtuesbnsRuBCNpisT2Mqp7R** passed public health/auth/private-boundary checks and an existing-session Meta connection test. The frontend bytes are unchanged from the later 3 November integration release. The source ZIP is under preparation after freeze, and the new three-minute video is separate from the unchanged older 90-second walkthrough.

Profiles/care/chat remain device-local; private server page memory is separate. Native physical tests, independent tester completion, unrestricted Facebook reviewer access and public real pet-photo generation remain unverified. WhatsApp is implemented but disabled/unconfigured with no delivery. Hardware, payments, cryptocurrency and social publishing remain concepts or pending integrations. Original 22 October development history is disclosed above.

A machine-readable review copy is saved locally as `checklist-2026-11-04/submission-form-draft.json`. It contains nulls for unanswered owner choices and public links, not fabricated placeholder URLs.
