export type SlideshowExportInput = {
  title: string;
  photos: { uri: string; caption?: string }[];
  secondsPerSlide: number;
  musicUri?: string;
};

export type SlideshowExportOptions = {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

export type SlideshowExportedVideo = {
  supported: true;
  blob: Blob;
  mimeType: string;
  extension: 'webm' | 'mp4';
  durationSeconds: number;
};

export type SlideshowExportResult = SlideshowExportedVideo | { supported: false; reason: string };

const reason = 'Use a supported web browser to download the video. You can still preview your slideshow here.';

export function getSlideshowExportSupport(): { supported: boolean; reason?: string } {
  return { supported: false, reason };
}

export async function exportSlideshow(
  _input: SlideshowExportInput,
  _options: SlideshowExportOptions = {},
): Promise<SlideshowExportResult> {
  return { supported: false, reason };
}

export function downloadSlideshow(_video: SlideshowExportedVideo, _title?: string): void {
  throw new Error(reason);
}
