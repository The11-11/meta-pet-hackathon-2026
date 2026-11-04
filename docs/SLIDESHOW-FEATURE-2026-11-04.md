# Muse photo slideshows — 4 November 2026

Meta Pet now includes a Muse Pet slideshow studio. Ask Muse to make a slideshow with music, or open it from the social page. Choose up to eight photos, organise People/Pet/Together labels, add captions, reorder, adjust pace, preview original music and save a browser video. Nothing is posted automatically.

The optional Facebook path requests `user_photos` separately from ordinary login. Browsing and importing use the current verified owner session; selected images are fetched through Meta Pet’s server, compressed locally and stored only when explicitly saved. Photos are not sent to the model. Facebook may withhold some tagged photos. Real permission consent and private tagged-photo import remain unverified.

A real Edge test with two bundled sample artwork images verified preview, music, local save/reload and an eight-second MP4 download with H.264 video and AAC music. This was not a private pet-photo or Facebook import test. The actual downloaded MP4 and audio verification receipt are retained in the dated artifact folder.

Final checks: 364 tests passed, zero failed/skipped; TypeScript and ESLint passed; Expo static web export passed with 24 HTML routes. Tests include owner isolation, permission revocation, download limits, saved draft isolation, deletion and queued-save/reset behavior.

Clear saved local data now deletes the current account/pet’s saved slideshow before resetting its profile. Ordinary sign-out retains it. Removing a photo in the editor requires saving to update the stored draft. Original source photos and previously downloaded videos are not changed.

Still unverified: real Facebook photo permission/import, device-photo selection and physical phone behavior. Native video download is not supported. This checkpoint does not publish the feature or the unfinished demo video.

Primary references: [Facebook user photos](https://developers.facebook.com/docs/graph-api/reference/user/photos/) and [Facebook Photo](https://developers.facebook.com/docs/graph-api/reference/photo/), rendered Graph API v26 documentation.

The original prototype began on 22 October 2026. Prior development records remain intact. Meta Pet is the app, Muse Pet the companion and Petaverse the wider ecosystem.

## Public demo release

The slideshow feature is now available at https://petaverse-meta-pet-demo.vercel.app/slideshow. Production deployment `dpl_9PR1EVrpWH5Qrw6XWAc3YaZ5EUtB` is READY. Public checks confirmed the exact new bundle, healthy authenticated API, unchanged Facebook callback, music/font assets and rejection of anonymous/forged photo requests. Existing routing and headers were retained.

Edge confirmed the live sample studio, two artwork images, music preview controls, explicit local save and actual browser MP4 creation/download. The downloaded 286,774-byte MP4 is retained as public-sample-app-export.mp4 in the dated artifacts (SHA256 98f72ecc91a3d556877b2a1176b1b875c582f36c20eb5fcb50e3fe77fba1e857). No Facebook photo permission was granted and no private photo was read. The promotional video and supplied banner were excluded. Real Facebook consent/photo import and physical-device checks remain outstanding. The temporary backend/tunnel still requires this computer to stay on.

The owner subsequently reported “Facebook granted photo access.” This records the owner’s consent result; actual tagged-photo loading/import and private-photo video creation still await the owner’s test result. No photo was provided to or read by the assistant. The public sample download independently decoded successfully to EOF: 8.44 seconds, H.264 1280×720, AAC stereo 48kHz, non-silent audio and zero clipping.
