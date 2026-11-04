# Pet notification recordings

These alerts use real animal recordings released under **CC0 1.0 Universal**, edited for short notifications. They contain no synthesized bark or meow.

- `bark.wav`: a Boston terrier recorded by **ipears1**, from [dogbark.wav on Freesound](https://freesound.org/people/ipears1/sounds/118072/). We used the publicly available HQ preview and selected the first bark. See [dog-source.json](source/dog-source.json) for the download URL, clip times, processing and file hashes.
- `meow_v2.wav`: a single cat meow recorded by **tuberatanka**, from [cat meow on Freesound](https://freesound.org/people/tuberatanka/sounds/110011/). We used the public HQ preview and trimmed quiet room noise while retaining the natural pitch and speed. See [cat-source.json](source/cat-source.json) for the selected clip, processing and file hashes. This replaces the earlier Kerzoven clip; the approved dog recording is unchanged. The new filename and `muse-meow-v2` Android channel prevent reuse of the earlier cat sound.

Original downloads are retained in `source/`. Both edited files are uncompressed PCM, 16-bit mono, 22,050 Hz, with short fades, silent endpoints and moderate peak levels. These are notification sounds; they do not translate animal behavior. [CC0 permits copying, adaptation and commercial use](https://creativecommons.org/publicdomain/zero/1.0/); attribution is retained here for provenance and does not imply creator endorsement.

To validate the bundled files from the project directory:

```sh
node scripts/validate-pet-sounds.mjs
```

This command only reads and validates the WAV files. It never synthesizes or overwrites audio.
