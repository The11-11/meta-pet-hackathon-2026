import { Asset } from 'expo-asset';

// Original instrumental composed for Meta Pet; see the adjacent asset receipt.
export const slideshowMusicSource = require('../assets/sounds/muse-original-slideshow.mp3');

export function slideshowMusicUri(): string | undefined {
  // Expo resolves numeric Metro modules as well as URI-shaped asset exports.
  // This reads bundled asset metadata; it does not download external audio.
  try { return Asset.fromModule(slideshowMusicSource).uri; }
  catch { return undefined; }
}
