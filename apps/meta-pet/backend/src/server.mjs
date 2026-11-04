import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, parse, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HttpError, museReply, parseChatRequest, checkProvider } from './muse.mjs';
import { createAuthService } from './auth.mjs';
import { generateAvatar, MAX_AVATAR_BODY_BYTES } from './avatar.mjs';
import { readFacebookLocations } from './facebook-location.mjs';
import { createFacebookPhotosService, FacebookPhotosError } from './facebook-photos.mjs';
import { createPageMemoryStore } from './memory.mjs';
import { createWhatsAppService, WhatsAppError } from './whatsapp.mjs';

const MAX_BODY_BYTES = 64 * 1_024;

function equalToken(expected, actual) {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Send an application/json request.');
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBytes) throw new HttpError(413, 'The request is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'The request must contain valid JSON.'); }
}

async function readRaw(request, maxBytes) {
  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Send an application/json request.');
  if (Number(request.headers['content-length']) > maxBytes) throw new HttpError(413, 'The request is too large.');
  const chunks = []; let length = 0;
  for await (const chunk of request) { length += chunk.length; if (length > maxBytes) throw new HttpError(413, 'The request is too large.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

async function whatsappOwner(request, authService) {
  const session = await authService.getSession(request.headers);
  if (!session?.session?.id || !session?.user?.id || request.headers['x-muse-owner'] !== session.user.id) throw new WhatsAppError(401, 'owner_required', 'Sign in with Facebook and verify your account to manage WhatsApp alerts.');
  return session.user.id;
}

async function facebookPhotosOwner(request, authService) {
  const session = await authService.getSession(request.headers);
  const owner = session?.user?.id;
  if (!session?.session?.id || typeof owner !== 'string' || !owner.trim() || owner.length > 200 || request.headers['x-muse-owner'] !== owner) throw new FacebookPhotosError(401, 'photos_sign_in_required', 'Sign in with Facebook and verify your account to choose tagged photos.');
  return owner;
}

function memoryPetId(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) throw new HttpError(400, 'Choose a saved pet page for memory.');
  return value.trim();
}

async function memoryOwner(request, authService) {
  const session = await authService.getSession(request.headers);
  if (!session?.session?.id || !session?.user?.id) throw new HttpError(401, 'Sign in with Facebook to use page memory.');
  if (request.headers['x-muse-owner'] !== session.user.id) throw new HttpError(401, 'Your signed-in account changed. Verify your account before using page memory.');
  return session.user.id;
}

/** An explicit root separates public demo memory from the local installation. */
export function readMemoryRoot(env = process.env) {
  if (env.MUSE_MEMORY_ROOT === undefined) return undefined;
  const value = typeof env.MUSE_MEMORY_ROOT === 'string' ? env.MUSE_MEMORY_ROOT.trim() : '';
  if (!value || value.length > 4096 || value.includes('\0') || !isAbsolute(value)) throw new Error('MUSE_MEMORY_ROOT must be an absolute non-root directory.');
  const root = resolve(value);
  if (root === parse(root).root) throw new Error('MUSE_MEMORY_ROOT must be an absolute non-root directory.');
  return root;
}

export function createMuseServer({ env = process.env, fetchImpl = fetch, authService = createAuthService({ env }), memoryStore = createPageMemoryStore({ root: readMemoryRoot(env) }), whatsappService = createWhatsAppService({ env, fetchImpl }), facebookPhotosService = createFacebookPhotosService({ fetchImpl }) } = {}) {
  const apiKey = env.MODEL_API_KEY?.trim() ?? '';
  const clientToken = env.MUSE_CLIENT_TOKEN?.trim() ?? '';
  const requireFacebookSession = env.NODE_ENV === 'production';
  const model = env.MODEL_NAME?.trim() || 'muse-spark-1.3';
  const allowedOrigins = new Set([...authService.webOrigins, 'metapet://', ...(env.ALLOWED_ORIGINS ?? 'http://localhost:8081,http://localhost:8083').split(',').map(origin => origin.trim()).filter(Boolean)]);
  const rateLimits = new Map();
  let verifiedAt = null;
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data) => {
      response.statusCode = status;
      response.end(data === undefined ? undefined : JSON.stringify(data));
    };
    try {
      const origin = request.headers.origin;
      if (origin && !allowedOrigins.has(origin)) throw new HttpError(403, 'This web origin is not allowed.');
      if (origin) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
        response.setHeader('Access-Control-Allow-Credentials', 'true');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, expo-origin, X-Muse-Owner');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      }
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (request.method === 'OPTIONS') return send(204);
      if (request.method === 'GET' && path === '/api/auth/config') return send(200, await authService.getConfig());
      if (path.startsWith('/api/auth/')) {
        if (request.method !== 'GET' && request.method !== 'POST') throw new HttpError(405, 'Use GET or POST for authentication.');
        if (Number(request.headers['content-length']) > MAX_BODY_BYTES) throw new HttpError(413, 'The request is too large.');
        // Only our socket supplies this header; never trust a caller's proxy IP.
        request.headers['x-muse-remote-address'] = request.socket.remoteAddress ?? '127.0.0.1';
        if (!await authService.handle(request, response)) throw new HttpError(503, 'Facebook sign-in is unavailable. Check the server configuration.');
        return;
      }
      if (path.startsWith('/api/whatsapp/')) {
        if (path === '/api/whatsapp/config') {
          if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); throw new HttpError(405, 'Use GET to check WhatsApp setup.'); }
          return send(200, whatsappService.getConfig());
        }
        if (path === '/api/whatsapp/webhook') {
          if (request.method === 'GET') {
            const challenge = whatsappService.verifyWebhook(new URL(request.url, 'http://localhost').searchParams);
            response.setHeader('Content-Type', 'text/plain; charset=utf-8'); response.statusCode = 200; return response.end(challenge);
          }
          if (request.method === 'POST') return send(200, whatsappService.webhook(await readRaw(request, 256 * 1024), request.headers['x-hub-signature-256']));
          response.setHeader('Allow', 'GET, POST'); throw new HttpError(405, 'Use the WhatsApp webhook verification or event action.');
        }
        const routes = { '/api/whatsapp/status': 'GET', '/api/whatsapp/pair': 'POST', '/api/whatsapp/disconnect': 'POST', '/api/whatsapp/reminders': 'POST', '/api/whatsapp/reminders/cancel': 'POST' };
        const method = routes[path];
        if (!method) return send(404, { error: 'Route not found.' });
        if (request.method !== method) { response.setHeader('Allow', method); throw new HttpError(405, 'Use the requested WhatsApp alert action.'); }
        const owner = await whatsappOwner(request, authService);
        if (path === '/api/whatsapp/status') return send(200, whatsappService.status(owner));
        const body = await readJson(request);
        if (path === '/api/whatsapp/pair') return send(200, whatsappService.pair(owner, body));
        if (path === '/api/whatsapp/disconnect') return send(200, whatsappService.disconnect(owner));
        if (path === '/api/whatsapp/reminders/cancel') return send(200, whatsappService.cancel(owner, body));
        return send(200, await whatsappService.schedule(owner, body));
      }
      if (request.method === 'GET' && path === '/health') {
        return send(200, { status: 'ok', mode: apiKey ? 'live' : 'demo', collarConnected: false, requiresAuth: Boolean(requireFacebookSession || apiKey || clientToken), providerConfigured: Boolean(apiKey), authConfigured: Boolean(clientToken), providerVerifiedAt: verifiedAt, model, capabilities: ['care_guidance', 'prepare_care_entry', 'prepare_appointment', 'prepare_social_post', 'owner_approval'] });
      }
      if (path === '/api/muse/memory' || path === '/api/muse/memory/clear') {
        const clearing = path.endsWith('/clear');
        if (request.method !== (clearing ? 'POST' : 'GET')) { response.setHeader('Allow', clearing ? 'POST' : 'GET'); throw new HttpError(405, 'Use the page memory read or clear action.'); }
        const ownerId = await memoryOwner(request, authService);
        const petId = memoryPetId(clearing ? (await readJson(request))?.petId : new URL(request.url ?? '/', 'http://localhost').searchParams.get('petId'));
        try { return send(200, clearing ? await memoryStore.clear(ownerId, petId) : await memoryStore.read(ownerId, petId)); }
        catch { throw new HttpError(503, 'Muse page memory could not be read or cleared. Please try again.'); }
      }
      if (path === '/api/facebook/tagged-photos' || path === '/api/facebook/tagged-photos/import') {
        if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); throw new HttpError(405, 'Use POST to choose tagged photos.'); }
        const owner = await facebookPhotosOwner(request, authService);
        const body = await readJson(request, 2048);
        const access = await authService.getFacebookAccessToken?.(request.headers);
        const result = path.endsWith('/import') ? await facebookPhotosService.import(owner, access, body) : await facebookPhotosService.list(owner, access, body);
        // A logout/revocation while Graph or the image is loading must not
        // return a private photo to an invalidated browser session.
        try { if (await facebookPhotosOwner(request, authService) !== owner) throw new Error('Changed account'); }
        catch { facebookPhotosService.clear(owner); throw new FacebookPhotosError(401, 'photos_sign_in_required', 'Your Facebook account changed. Sign in again before choosing photos.'); }
        return send(200, result);
      }
      if (path === '/api/facebook/location') {
        if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); throw new HttpError(405, 'Use GET for Facebook areas.'); }
        const source = new URL(request.url ?? '/', 'http://localhost').searchParams.get('source');
        if (!['profile', 'pages'].includes(source)) throw new HttpError(400, 'Choose profile or pages as the Facebook area source.');
        const session = await authService.getSession(request.headers);
        if (!session?.session?.id || !session?.user?.id) throw new HttpError(401, 'Sign in with Facebook to import an area.');
        if (request.headers['x-muse-owner'] !== session.user.id) throw new HttpError(401, 'Your signed-in account changed. Verify your account before importing a Facebook area.');
        const rateKey = session.user.id + ':facebook-location';
        const now = Date.now();
        if (rateLimits.size > 1_000) for (const [key, value] of rateLimits) if (value.resetAt <= now) rateLimits.delete(key);
        const limit = rateLimits.get(rateKey);
        if (limit && limit.resetAt > now && limit.count >= 10) throw new HttpError(429, 'Too many area requests. Please try again later.');
        rateLimits.set(rateKey, !limit || limit.resetAt <= now ? { count: 1, resetAt: now + 10 * 60_000 } : { ...limit, count: limit.count + 1 });
        const access = await authService.getFacebookAccessToken?.(request.headers);
        return send(200, await readFacebookLocations({ source, access, fetchImpl }));
      }
      if (!['/api/muse/chat', '/api/muse/check', '/api/muse/avatar'].includes(path)) return send(404, { error: 'Route not found.' });
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        throw new HttpError(405, 'Use POST for Muse chat.');
      }
      const authorization = request.headers.authorization ?? '';
      // Shared development tokens never authorize the public production server.
      const localToken = Boolean(!requireFacebookSession && clientToken && equalToken('Bearer ' + clientToken, authorization));
      const ownerClaim = request.headers['x-muse-owner'];
      let verifiedOwner = null;
      // An actual Facebook session takes precedence over a preview token.
      // A legacy token with no verified session can still request care, but
      // a caller-supplied owner id never grants access to page memory.
      if (requireFacebookSession || ownerClaim !== undefined || ((apiKey || clientToken) && !localToken)) {
        const session = await authService.getSession(request.headers);
        if (session?.session?.id && session?.user?.id) {
          if (ownerClaim !== session.user.id) throw new HttpError(401, 'Your signed-in account changed. Verify your account before sending pet records.');
          verifiedOwner = session.user.id;
        } else if (!localToken) {
          if (!ownerClaim && !clientToken && !(await authService.getConfig()).available) throw new HttpError(503, 'Live Muse requires Facebook sign-in or a client token configured on the server.');
          throw new HttpError(401, 'A valid client token or signed-in session is required.');
        }
      }
      const avatar = path === '/api/muse/avatar';
      if (avatar && !apiKey) throw new HttpError(503, 'Personalized Muse avatars need the Meta model API key configured on the server.');
      // Authenticated people behind the same proxy receive separate quotas.
      // Unauthenticated development callers still use the actual socket only.
      const address = JSON.stringify([verifiedOwner ? 'owner' : 'socket', verifiedOwner ?? request.socket.remoteAddress ?? 'local', avatar ? 'avatar' : 'care']);
      const now = Date.now();
      if (rateLimits.size > 1_000) for (const [key, value] of rateLimits) if (value.resetAt <= now) rateLimits.delete(key);
      const limit = rateLimits.get(address);
      if (limit && limit.resetAt > now && limit.count >= (avatar ? 3 : 30)) throw new HttpError(429, 'Too many requests. Please try again later.');
      rateLimits.set(address, !limit || limit.resetAt <= now ? { count: 1, resetAt: now + 10 * 60 * 1_000 } : { ...limit, count: limit.count + 1 });
      const body = await readJson(request, avatar ? MAX_AVATAR_BODY_BYTES : MAX_BODY_BYTES);
      if (avatar) return send(200, await generateAvatar(body, { apiKey, fetchImpl }));
      if (path === '/api/muse/check') {
        const result = await checkProvider({ apiKey, model, fetchImpl });
        verifiedAt = result.checkedAt ?? null;
        return send(200, result);
      }
      const input = parseChatRequest(body);
      const memoryEnabled = Boolean(verifiedOwner && input.pet.id && input.taskPurpose !== 'social_draft');
      let memoryTurn;
      if (memoryEnabled) {
        try { memoryTurn = await memoryStore.beginTurn(verifiedOwner, input.pet.id, input); }
        catch { throw new HttpError(503, 'Muse could not read this page memory. Try again, or clear this page memory.'); }
      }
      const result = await museReply(input, { apiKey, model, fetchImpl, memoryContext: memoryTurn?.context });
      if (result.mode === 'live') verifiedAt = new Date().toISOString();
      let memorySaved = false;
      if (memoryTurn) { try { memorySaved = await memoryTurn.commit(); } catch { /* Return the successful care reply with an honest unsaved status. */ } }
      return send(200, { ...result, memory: { enabled: memoryEnabled, saved: memorySaved } });
    } catch (error) {
      // Never return upstream response bodies, request context, or credentials.
      const safe = error instanceof HttpError || error instanceof WhatsAppError || error instanceof FacebookPhotosError;
      return send(safe ? error.status : 500, {
        error: safe ? error.message : 'The care companion could not complete this request.',
        ...(error instanceof WhatsAppError || error instanceof FacebookPhotosError ? { errorCode: error.code } : {}),
      });
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.on('listening', () => { whatsappService.start(); });
  server.on('close', () => { void authService.close(); void whatsappService.close(); });
  return server;
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  const server = createMuseServer();
  server.listen(port, host, () => console.log(`Muse Pet backend listening on ${host}:${port} (${process.env.MODEL_API_KEY?.trim() ? 'live' : 'demo'} mode).`));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
