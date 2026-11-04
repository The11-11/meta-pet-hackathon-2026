# Meta Hackathon

The dedicated workspace for **Meta Pet**, the pet-care app in the **Petaverse** ecosystem. **Muse Pet** is the AI companion inside the app.

## Start here

- [Project brief](docs/PROJECT-BRIEF.md): the product, brand roles and hackathon focus.
- [Demo flow](docs/DEMO-FLOW.md): signup, pet profile, custom avatar and companion demo.
- [Next steps](docs/NEXT-STEPS.md): remaining integration and device work.
- [Hackathon updates](docs/HACKATHON-UPDATES.md): confirmed event dates, judging overview and monitoring baseline.
- [Submission guide](submissions/README.md): materials to prepare after confirming the official requirements.
- [App source](apps/meta-pet/README.md): development and connection instructions.

## Run the app

Open `Start-MetaPet.cmd` for the web preview at **http://localhost:8083/**. Open `Start-Muse.cmd` for the existing private Muse backend at **http://127.0.0.1:8787**. Keep both running while using live Muse.

The canonical app folder is `apps/meta-pet`. Its private backend settings remain in `apps/meta-pet/backend/.env`. The original app path redirects here, so existing editor links and dependency paths keep working. There is one active source tree.

The source archive in `backups/` preserves the pre-workspace code and artwork without credentials, dependencies or generated builds. Browser pet records remain at the same localhost origin. No GitHub repository, public deployment or store release was created by this workspace setup.

## Workspace map

| Folder | Contents |
| --- | --- |
| `apps/meta-pet/` | Expo app, Muse backend, assets and tests |
| `docs/` | Product brief, demo flow and next steps |
| `media/` | Selected local demo evidence |
| `submissions/` | Submission preparation |
| `backups/` | Preserved source archive |

**Submission target: 1 November 2026 at 04:00 SAST**, four days before the official deadline; aim to finish the upload during **31 October**. The pitch focuses on Meta Pet and its working demo; internal project history is kept in [workspace notes](docs/WORKSPACE-NOTES.md).
