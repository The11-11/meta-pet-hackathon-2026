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

const WIDTH = 1280;
const HEIGHT = 720;
const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
const unavailable = 'Video download is not available in this browser. Try a current desktop browser; your draft stays on this device.';
const formats = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];

function recordingFormat(): string | undefined {
  return formats.find(format => MediaRecorder.isTypeSupported(format));
}

export function getSlideshowExportSupport(): { supported: boolean; reason?: string } {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof MediaRecorder === 'undefined'
    || typeof MediaRecorder.isTypeSupported !== 'function' || typeof MediaStream === 'undefined') {
    return { supported: false, reason: unavailable };
  }
  try {
    if (typeof document.createElement('canvas').captureStream !== 'function' || !recordingFormat()) {
      return { supported: false, reason: unavailable };
    }
  } catch {
    return { supported: false, reason: unavailable };
  }
  return { supported: true };
}

function cancelled(): DOMException {
  return new DOMException('Video creation cancelled.', 'AbortError');
}

function checkAbort(signal: AbortSignal): void {
  if (signal.aborted) throw cancelled();
}

function localAssetUri(uri: string, kind: 'photo' | 'music'): string {
  if (typeof uri !== 'string' || !uri || uri.length > MAX_ASSET_BYTES * 1.5) throw new Error(`Choose a smaller ${kind} file from this device.`);
  const data = kind === 'photo' ? /^data:image\/(?:jpeg|png|webp|avif|gif);base64,[a-z\d+/=\s]+$/i
    : /^data:audio\/(?:mpeg|mp3|wav|x-wav|ogg|mp4|aac|webm);base64,[a-z\d+/=\s]+$/i;
  if (data.test(uri)) return uri;
  let url: URL;
  try { url = new URL(uri, window.location.href); } catch { throw new Error(`Choose a ${kind} file from this device.`); }
  if (url.protocol === 'blob:' && url.origin === window.location.origin) return url.href;
  const bundled = url.pathname.startsWith('/assets/') || url.pathname.startsWith('/_expo/static/');
  if (['http:', 'https:'].includes(url.protocol) && url.origin === window.location.origin && bundled
    && !/%2f|%5c/i.test(url.pathname) && !url.username && !url.password) return url.href;
  throw new Error(`Choose a local ${kind} file. External links are not imported.`);
}

function validatedInput(input: SlideshowExportInput): SlideshowExportInput {
  if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 80) throw new Error('Give the slideshow a title of 1–80 characters.');
  if (!Array.isArray(input.photos) || input.photos.length < 1 || input.photos.length > 8) throw new Error('Choose 1–8 photos for the slideshow.');
  if (!Number.isFinite(input.secondsPerSlide) || input.secondsPerSlide < 1 || input.secondsPerSlide > 10 || input.photos.length * input.secondsPerSlide > 60) throw new Error('Keep the slideshow within 60 seconds, with 1–10 seconds per photo.');
  const photos = input.photos.map(photo => {
    if (!photo || (photo.caption !== undefined && (typeof photo.caption !== 'string' || photo.caption.length > 160))) throw new Error('Keep each photo caption within 160 characters.');
    return { uri: localAssetUri(photo.uri, 'photo'), caption: photo.caption?.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() };
  });
  return { title: input.title.trim().replace(/[\u0000-\u001f\u007f]/g, ' '), photos, secondsPerSlide: input.secondsPerSlide,
    musicUri: input.musicUri === undefined ? undefined : localAssetUri(input.musicUri, 'music') };
}

async function assetBlob(uri: string, signal: AbortSignal): Promise<Blob> {
  checkAbort(signal);
  const response = await fetch(uri, { signal, credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw new Error('A selected file could not be opened. Choose it again.');
  if (Number(response.headers.get('content-length')) > MAX_ASSET_BYTES) throw new Error('Choose a file smaller than 20 MB.');
  const blob = await response.blob();
  if (!blob.size || blob.size > MAX_ASSET_BYTES) throw new Error('Choose a file smaller than 20 MB.');
  checkAbort(signal);
  return blob;
}

async function photoCanvas(uri: string, signal: AbortSignal): Promise<HTMLCanvasElement> {
  const blob = await assetBlob(uri, signal);
  if (!/^image\/(?:jpeg|png|webp|avif|gif)(?:;|$)/i.test(blob.type)) throw new Error('Choose a JPG, PNG or WebP photo from this device.');
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const abort = () => done(cancelled());
      signal.addEventListener('abort', abort, { once: true });
      const done = (error?: Error) => {
        signal.removeEventListener('abort', abort); image.onload = null; image.onerror = null;
        if (error) reject(error); else resolve();
      };
      image.onload = () => done();
      image.onerror = () => done(new Error('A photo could not be read. Choose a JPG, PNG or WebP image.'));
      image.src = url;
      if (signal.aborted) abort();
    });
    checkAbort(signal);
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 80_000_000) throw new Error('Choose a smaller version of this photo.');
    const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT - 180;
    const context = canvas.getContext('2d');
    if (!context) throw new Error(unavailable);
    context.fillStyle = '#0b182b'; context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const width = image.naturalWidth * scale; const height = image.naturalHeight * scale;
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    return canvas;
  } finally { image.src = ''; URL.revokeObjectURL(url); }
}

function textLines(context: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const lines: string[] = []; let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > width) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  const visible = lines.slice(0, maxLines);
  for (let i = 0; i < visible.length; i++) {
    let value = visible[i];
    const shortened = context.measureText(value).width > width || (i === maxLines - 1 && lines.length > maxLines);
    while (value && context.measureText(value + (shortened ? '…' : '')).width > width) value = value.slice(0, -1);
    visible[i] = value + (shortened ? '…' : '');
  }
  return visible;
}

function frame(context: CanvasRenderingContext2D, canvases: HTMLCanvasElement[], input: SlideshowExportInput, elapsed: number): void {
  const index = Math.min(canvases.length - 1, Math.floor(elapsed / input.secondsPerSlide));
  const inside = elapsed - index * input.secondsPerSlide;
  const blend = index < canvases.length - 1 ? Math.max(0, (inside - input.secondsPerSlide + 0.4) / 0.4) : 0;
  context.fillStyle = '#0b182b'; context.fillRect(0, 0, WIDTH, HEIGHT);
  context.globalAlpha = 1; context.drawImage(canvases[index], 0, 80);
  if (blend > 0) { context.globalAlpha = Math.min(1, blend); context.drawImage(canvases[index + 1], 0, 80); context.globalAlpha = 1; }
  context.textAlign = 'center'; context.fillStyle = '#f4f8fd'; context.font = '600 30px system-ui, sans-serif';
  for (const [line, text] of textLines(context, input.title, WIDTH - 96, 1).entries()) context.fillText(text, WIDTH / 2, 47 + line * 34);
  context.font = '25px system-ui, sans-serif';
  for (const [line, text] of textLines(context, input.photos[index].caption ?? '', WIDTH - 112, 2).entries()) context.fillText(text, WIDTH / 2, HEIGHT - 64 + line * 31);
  context.fillStyle = '#a7d4ff'; context.font = '17px system-ui, sans-serif';
  context.fillText(`Muse Pet · ${index + 1} / ${canvases.length}`, WIDTH / 2, HEIGHT - 12);
}

export async function exportSlideshow(input: SlideshowExportInput, options: SlideshowExportOptions = {}): Promise<SlideshowExportResult> {
  const support = getSlideshowExportSupport();
  if (!support.supported) return { supported: false, reason: support.reason ?? unavailable };
  const prepared = validatedInput(input);
  if (document.hidden) throw new Error('Keep this tab visible while creating the video.');
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  options.signal?.addEventListener('abort', relayAbort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const signal = controller.signal;
  let audio: AudioContext | undefined; let source: AudioBufferSourceNode | undefined; let gain: GainNode | undefined;
  let recording: MediaRecorder | undefined; let stream: MediaStream | undefined; let audioStream: MediaStream | undefined;
  let animation = 0; let stopTimer: ReturnType<typeof setTimeout> | undefined;
  const images: HTMLCanvasElement[] = []; const canvas = document.createElement('canvas');
  const progress = (value: number) => { options.onProgress?.(Math.max(0, Math.min(1, value))); };
  try {
    checkAbort(signal); progress(0);
    if (prepared.musicUri) {
      const AudioConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioConstructor) return { supported: false, reason: 'This browser cannot include music in a video. Try a current desktop browser.' };
      audio = new AudioConstructor();
      // Called before the first await, while the Create button still has user activation.
      await Promise.race([audio.resume(), new Promise<never>((_, reject) => {
        stopTimer = setTimeout(() => reject(new Error('Tap Create again to enable music, and keep this tab open.')), 5000);
      })]);
      clearTimeout(stopTimer); stopTimer = undefined;
      checkAbort(signal);
      if (audio.state !== 'running') throw new Error('Tap Create again to enable music.');
    }
    for (const [index, photo] of prepared.photos.entries()) {
      images.push(await photoCanvas(photo.uri, signal)); progress(0.12 * (index + 1) / prepared.photos.length);
    }
    let music: AudioBuffer | undefined;
    if (audio && prepared.musicUri) {
      const bytes = await (await assetBlob(prepared.musicUri, signal)).arrayBuffer();
      music = await audio.decodeAudioData(bytes); checkAbort(signal);
      if (!music.length || !music.duration) throw new Error('The music could not be read.');
    }
    checkAbort(signal);
    if (document.hidden) throw new Error('Keep this tab visible while creating the video.');
    canvas.width = WIDTH; canvas.height = HEIGHT;
    const context = canvas.getContext('2d'); if (!context) throw new Error(unavailable);
    frame(context, images, prepared, 0);
    stream = canvas.captureStream(24);
    if (!stream.getVideoTracks().length) throw new Error(unavailable);
    const duration = prepared.photos.length * prepared.secondsPerSlide;
    if (audio && music) {
      const destination = audio.createMediaStreamDestination(); audioStream = destination.stream;
      source = audio.createBufferSource(); source.buffer = music; source.loop = true;
      gain = audio.createGain(); source.connect(gain); gain.connect(destination);
      const now = audio.currentTime;
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.7, now + Math.min(0.3, duration / 4));
      gain.gain.setValueAtTime(0.7, now + Math.max(0.3, duration - 0.6)); gain.gain.linearRampToValueAtTime(0, now + duration);
      for (const track of audioStream.getAudioTracks()) stream.addTrack(track);
    }
    const mimeType = recordingFormat();
    recording = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 128_000 });
    const recorder = recording;
    const blob = await new Promise<Blob>((resolve, reject) => {
      const chunks: Blob[] = []; let bytes = 0; let settled = false;
      const removeListeners = () => { signal.removeEventListener('abort', abort); document.removeEventListener('visibilitychange', visibility); };
      const fail = (error: Error) => {
        if (settled) return; settled = true; removeListeners();
        if (recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* Cleanup still rejects this partial recording. */ } }
        reject(error);
      };
      const abort = () => fail(cancelled());
      const visibility = () => { if (document.hidden) fail(new Error('Video creation stopped when the tab was hidden. Keep it visible and try again.')); };
      signal.addEventListener('abort', abort, { once: true }); document.addEventListener('visibilitychange', visibility);
      recorder.ondataavailable = event => {
        if (!settled && event.data.size) { chunks.push(event.data); bytes += event.data.size; }
        if (bytes > MAX_VIDEO_BYTES) fail(new Error('Try fewer photos to make a smaller video.'));
      };
      recorder.onerror = () => fail(new Error('This browser could not finish the video. Your slideshow draft is unchanged.'));
      recorder.onstop = () => {
        if (settled) return; settled = true; removeListeners();
        if ((performance.now() - start) / 1000 < duration - 0.2) { reject(new Error('The recording stopped early. Keep this tab visible and try again.')); return; }
        const result = new Blob(chunks, { type: recorder.mimeType || mimeType });
        if (!result.size) reject(new Error('The video was empty. Keep this tab visible and try again.')); else resolve(result);
      };
      const start = performance.now(); let lastFrame = start;
      const draw = () => {
        if (settled) return;
        if (signal.aborted) { abort(); return; }
        const now = performance.now();
        if (now - lastFrame > 1500) { fail(new Error('The browser paused video creation. Keep this tab visible and try again.')); return; }
        lastFrame = now;
        const elapsed = Math.min(duration, (now - start) / 1000);
        try { frame(context, images, prepared, elapsed); progress(0.12 + 0.85 * elapsed / duration); } catch { fail(new Error('The video could not be drawn. Please try again.')); return; }
        if (elapsed >= duration) { if (recorder.state !== 'inactive') recorder.stop(); return; }
        animation = requestAnimationFrame(draw);
      };
      try {
        checkAbort(signal); recorder.start(500); source?.start();
        stopTimer = setTimeout(() => fail(new Error('Video creation took too long. Keep this tab visible and try again.')), (duration + 15) * 1000);
        animation = requestAnimationFrame(draw);
      } catch { fail(signal.aborted ? cancelled() : new Error('This browser could not start the video.')); }
    });
    checkAbort(signal); progress(1);
    const actualType = blob.type || recording.mimeType;
    if (!/^video\/(mp4|webm)(?:;|$)/i.test(actualType)) throw new Error('This browser produced an unsupported video format.');
    return { supported: true, blob, mimeType: actualType, extension: actualType.toLowerCase().startsWith('video/mp4') ? 'mp4' : 'webm', durationSeconds: duration };
  } finally {
    controller.abort(); options.signal?.removeEventListener('abort', relayAbort);
    cancelAnimationFrame(animation); clearTimeout(stopTimer);
    if (recording && recording.state !== 'inactive') { try { recording.stop(); } catch { /* Already stopped by the browser. */ } }
    try { source?.stop(); } catch { /* A source that never started is safe to discard. */ } source?.disconnect(); gain?.disconnect();
    stream?.getTracks().forEach(track => track.stop()); audioStream?.getTracks().forEach(track => track.stop());
    if (audio && audio.state !== 'closed') await audio.close().catch(() => undefined);
    for (const image of images) { image.width = 0; image.height = 0; }
    canvas.width = 0; canvas.height = 0;
  }
}

export function downloadSlideshow(video: SlideshowExportedVideo, title = 'Meta Pet slideshow'): void {
  if (!video.blob.size || !/^video\/(mp4|webm)(?:;|$)/i.test(video.mimeType)) throw new Error('Create the video before downloading it.');
  const url = URL.createObjectURL(video.blob);
  const anchor = document.createElement('a');
  const extension = video.mimeType.toLowerCase().startsWith('video/mp4') ? 'mp4' : 'webm';
  anchor.href = url; anchor.download = `${title.replace(/[^\p{L}\p{N}._ -]/gu, '').replace(/^\.+|\.+$/g, '').trim().slice(0, 80) || 'Meta Pet slideshow'}.${extension}`;
  anchor.style.display = 'none'; document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
}
