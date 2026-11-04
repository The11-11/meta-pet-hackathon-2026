/** Opening the local studio never grants access to a photo library or social account. */
export function isSlideshowRequest(message: string): boolean {
  const text = message.trim();
  if (!text || text.length > 2000 || !/\b(?:slideshow|slide[\s-]+show)\b/i.test(text)) return false;
  if (/\b(?:don['’]?t|do not|never)\s+(?:(?:want|need)\s+(?:to\s+)?)?(?:make|create|build|generate|start|open|put together)\b[^;.!?]{0,70}\b(?:slideshow|slide[\s-]+show)\b/i.test(text)
    || /\b(?:stop|cancel|without|instead of)\s+(?:(?:a|the|my)\s+)?(?:slideshow|slide[\s-]+show)\b/i.test(text)
    || /\b(?:don['’]?t|do not)\s+(?:want|need)\s+(?:(?:a|the)\s+)?(?:slideshow|slide[\s-]+show)\b/i.test(text)) return false;
  return /\b(?:make|create|build|generate|start|open|put together)\b[\s\S]{0,100}\b(?:slideshow|slide[\s-]+show)\b/i.test(text)
    || /^(?:muse[,!:.]?\s*)?(?:a\s+)?(?:slideshow|slide[\s-]+show)(?:\s+please)?[.!?]*$/i.test(text);
}
