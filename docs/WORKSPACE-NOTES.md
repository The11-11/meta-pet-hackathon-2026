# Workspace setup

Created **25 October 2026** for the existing Meta Hackathon project. This chat is grouped under that project.

## Internal project history

The original local prototype began on **22 October 2026**. The owner describes the early phase as concept testing and prototype exploration. Retain the original source, verification records and backups as the development history.

The target is to submit **1 November 2026 at 04:00 SAST**, four days before the official deadline of **5 November at 04:00 SAST**; aim to finish the upload during **31 October**. The [update baseline](HACKATHON-UPDATES.md) records the official source and active monitoring. The public pitch focuses on Meta Pet, Muse Pet and the working demo. Supply earlier testing or reused-work details when the official rules or entry form require them.

## Workspace setup and recovery

The registered local project folder is `C:/Users/Neo/Documents/ChatGPT/Meta Hackathon/`. The canonical app is `apps/meta-pet/`. The earlier `C:/Users/Neo/Documents/Codex/Meta-Hackathon/` workspace redirects to this folder. The earlier `2026-10-22/files-pasted-by-the-user-skip/outputs/meta-pet-mobile` location is an NTFS junction to this directory. Keep that junction: the currently installed dependency links still refer to it. A future deliberate dependency reinstall can regenerate those links at the canonical location.

Private backend settings and any local backend data moved with the app. They were not duplicated into the source archive or uploaded. Existing editor links through the earlier path still reach the same files. Browser storage remains associated with `http://localhost:8083`, so the owner’s saved local pet records keep their original scope.

Run app and backend commands from the canonical directory. The root launchers select that directory and the existing ports. The preview starts with IPv4-first localhost resolution. For agent checks in this environment, the installed TypeScript and ESLint entry points can be invoked directly with Node; pnpm may need to register the relocated project before its wrapper works.

The pre-workspace archive in `backups/` contains source and artwork, excluding private credentials, backend account data, dependencies and generated builds. App identifiers, owner storage keys and notification channels were preserved during the naming correction.

