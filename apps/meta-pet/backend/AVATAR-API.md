# Personalized Muse avatars

`POST /api/muse/avatar` transforms an owner-selected pet photo using Meta's `muse-image-1.0`. It uses the existing server-only `MODEL_API_KEY` and the same development Bearer token or verified Facebook session plus `X-Muse-Owner` binding as other Muse requests. The model name and outgoing domain are fixed in the backend. Facebook credentials are not needed when using the existing local development token.

## Request

```json
{
  "pet": { "id": "your-current-pet-id", "name": "Kai", "species": "Dog" },
  "photo": { "mimeType": "image/jpeg", "base64": "<normalized-photo-base64>" }
}
```

The frontend should resize/re-encode the chosen photo into a JPEG or PNG before uploading, stripping camera metadata. The backend accepts raw canonical base64, not a URL or a data-URL wrapper. JSON is limited to 3 MiB; decoded photos to 2 MiB, 16 million pixels, and 8192 pixels per edge. MIME signatures, bounded PNG chunks/JPEG frame dimensions and file endings are checked without decompressing untrusted pixels. This is structural validation, not a full image decoder. Only the known pet/photo fields are sent to Meta. Supported profile species are `Dog`, `Cat` and `Other`.

The fixed prompt asks for the photographed animal's distinctive head, ears, muzzle and fur markings on a friendly upright plush body, with a violet collar and blue charm, against a plain pale blue background. It requests one square PNG. Size is an aspect-ratio hint: Meta may return dimensions different from 1024×1024.

## Response

```json
{
  "mode": "live",
  "model": "muse-image-1.0",
  "petId": "your-current-pet-id",
  "generatedAt": "2026-10-25T12:00:00.000Z",
  "image": {
    "mimeType": "image/png",
    "dataUrl": "data:image/png;base64,<actual-provider-image>",
    "width": 1024,
    "height": 1024
  }
}
```

The response contains a static image, not an animation or wearable connection. Persist it only for the current owner/pet after confirming that the active owner and pet still match the request snapshot. Prefer an app-private local image file over repeatedly storing large data URLs in care JSON. The backend does not save the source photo or generated avatar; `store: false` disables Responses conversation persistence. Web search, image search and shell tools are disabled for this request.

There is no personalized-avatar demo fallback. Missing model credentials return 503; missing/mismatched authentication returns 401 or setup-related 503; unsupported/invalid photos return 400; oversized request bodies return 413; rate limiting returns 429; provider failures return 502/503 and timeouts return 504. Only a completed provider `image_generation_call` with a structurally validated PNG becomes success. Provider URLs are never fetched. Provider responses are capped at 12 MiB and decoded output images at 8 MiB. Up to three avatar attempts per client IP are allowed in ten minutes.

Generation can take longer than chat. The backend aborts after 120 seconds; use at least a 130-second client timeout and keep a visible generating/cancel/error state. Canceling locally must not present a completed avatar. Real success still requires a valid Meta API key and access to Muse Image; tests only use synthetic responses.

## Official protocol

The backend uses the documented [Muse Image Responses flow](https://dev.meta.ai/docs/image-generation): `POST https://api.meta.ai/v1/responses`, a reference `input_image` data URL, `model: "muse-image-1.0"`, `store: false`, and an `image_generation` tool with PNG output and external tools disabled. The actual image is the base64 `result` on the `image_generation_call` output item. Model availability is described in [Meta's model catalog](https://dev.meta.ai/docs/models).
