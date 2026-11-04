import { createHash } from 'node:crypto';

export const FACEBOOK_PHOTOS_GRAPH_VERSION = 'v26.0';
const TTL = 5 * 60_000;
const MAX_JSON = 128 * 1024;
const MAX_IMAGE = 8 * 1024 * 1024;
const photoId = value => typeof value === 'string' && /^\d{1,40}$/.test(value);
const cursor = value => typeof value === 'string' && /^[A-Za-z0-9_+/=-]{1,1024}$/.test(value);
export class FacebookPhotosError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const unavailable = () => new FacebookPhotosError(503, 'photos_unavailable', 'Facebook photos are unavailable right now. Try again, or choose photos from your device.');
const permissionRequired = () => new FacebookPhotosError(403, 'photos_permission_required', 'Facebook photo access was not allowed, has expired, or is unavailable for this app. Reconnect photo access, or choose photos from your device.');
const invalidImage = () => new FacebookPhotosError(422, 'photos_invalid_image', 'This photo could not be safely imported. Choose a smaller JPG, PNG or WebP photo.');

export function facebookPhotoCdnUrl(value, token = '') {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || !(/^(?:[a-z0-9-]+\.)*fbcdn\.net$/.test(host) || host === 'lookaside.fbsbx.com')) return null;
    for (const [key, item] of url.searchParams) if (/^(?:access_token|appsecret_proof|authorization|auth_token|token)$/i.test(key) || (token && item.includes(token))) return null;
    if (token && url.href.includes(token)) return null;
    return url.href;
  } catch { return null; }
}

async function boundedBytes(response, maximum) {
  if (Number(response.headers?.get?.('content-length')) > maximum || !response.body?.getReader) throw new Error('Response exceeds bounds.');
  const reader = response.body.getReader(); const chunks = []; let length = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > maximum) throw new Error('Response exceeds bounds.'); chunks.push(Buffer.from(value)); }
    return Buffer.concat(chunks);
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
}

export function inspectFacebookPhoto(bytes, mime) {
  const type = typeof mime === 'string' ? mime.split(';')[0].trim().toLowerCase() : '';
  let width, height;
  if (type === 'image/png' && bytes.length >= 24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16) === 'IHDR') {
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else if (type === 'image/jpeg' && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[bytes.length-2] === 255 && bytes[bytes.length-1] === 217) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 216 || marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break;
      const size = bytes.readUInt16BE(offset); if (size < 2 || offset + size > bytes.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && size >= 8) { height = bytes.readUInt16BE(offset+3); width = bytes.readUInt16BE(offset+5); break; }
      offset += size;
    }
  } else if (type === 'image/webp' && bytes.length >= 25 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length) {
    const kind = bytes.toString('ascii',12,16);
    if (kind === 'VP8X' && bytes.length >= 30) { width = 1+bytes.readUIntLE(24,3); height = 1+bytes.readUIntLE(27,3); }
    else if (kind === 'VP8L' && bytes[20] === 47) { width = 1+((bytes[21]|bytes[22]<<8)&16383); height = 1+((bytes[22]>>6|bytes[23]<<2|bytes[24]<<10)&16383); }
    else if (kind === 'VP8 ' && bytes.length >= 30 && bytes.subarray(23,26).equals(Buffer.from([157,1,42]))) { width = bytes.readUInt16LE(26)&16383; height = bytes.readUInt16LE(28)&16383; }
  }
  if (!width || !height || width > 20000 || height > 20000 || width * height > 50_000_000) throw invalidImage();
  return { width, height, mime: type };
}

export function createFacebookPhotosService({ fetchImpl = fetch, now = Date.now, timeoutMs = 8000 } = {}) {
  const owners = new Map();
  function state(owner) {
    if (typeof owner !== 'string' || !owner.trim() || owner.length > 200 || /[\x00-\x1f]/.test(owner)) throw new FacebookPhotosError(401, 'photos_sign_in_required', 'Sign in with Facebook to choose tagged photos.');
    for (const [id, value] of owners) if (value.touched <= now()-10*60_000) owners.delete(id);
    let value = owners.get(owner);
    if (!value) { if (owners.size >= 100) owners.delete(owners.keys().next().value); value = { ids: new Map(), cursors: new Set(), revision: 0, touched: now(), tokenHash: '', limits: {} }; }
    owners.delete(owner); owners.set(owner,value); value.touched = now(); return value;
  }
  function clear(value) { value.ids.clear(); value.cursors.clear(); value.revision++; }
  function rate(value, kind) {
    const limit = value.limits[kind]; const at = now();
    if (limit && limit.resetAt > at && limit.count >= (kind === 'list' ? 12 : 16)) throw new FacebookPhotosError(429, 'photos_rate_limited', 'Too many photo requests. Please wait a few minutes, or choose photos from your device.');
    value.limits[kind] = !limit || limit.resetAt <= at ? { count: 1, resetAt: at+10*60_000 } : { ...limit, count: limit.count+1 };
  }
  function accessToken(access, value) {
    const token = access?.token;
    if (typeof token !== 'string' || !token.trim() || token.length > 8192 || /[\x00-\x20\x7f]/.test(token)) { clear(value); throw permissionRequired(); }
    const hash = createHash('sha256').update(token).digest('hex');
    if (value.tokenHash && value.tokenHash !== hash) clear(value); value.tokenHash = hash;
    return token;
  }
  async function request(url, token, maximum, image = false) {
    const controller = new AbortController(); let timer;
    try {
      return await Promise.race([(async () => {
        const response = await fetchImpl(url, { method: 'GET', redirect: 'error', credentials: 'omit', signal: controller.signal,
          headers: token ? { Authorization: 'Bearer '+token, Accept: 'application/json' } : { Accept: 'image/jpeg,image/png,image/webp' } });
        if (image) {
          if (!response.ok || response.status >= 300 || response.redirected) throw invalidImage();
          const bytes = await boundedBytes(response, maximum); if (!bytes.length) throw invalidImage();
          return { bytes, image: inspectFacebookPhoto(bytes, response.headers.get('content-type')) };
        }
        const bytes = await boundedBytes(response, maximum); let body;
        try { body = JSON.parse(bytes.toString('utf8')); } catch { throw unavailable(); }
        if (!response.ok || body?.error) {
          if ([401,403].includes(response.status) || [10,102,190,200,294,299].includes(Number(body?.error?.code))) throw permissionRequired();
          throw unavailable();
        }
        return body;
      })(), new Promise((_,reject) => { timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, timeoutMs); })]);
    } catch (error) { if (error instanceof FacebookPhotosError) throw error; throw image ? invalidImage() : unavailable(); }
    finally { clearTimeout(timer); controller.abort(); }
  }
  async function permission(token, value) {
    try {
      const body = await request(`https://graph.facebook.com/${FACEBOOK_PHOTOS_GRAPH_VERSION}/me/permissions`, token, MAX_JSON);
      if (!Array.isArray(body?.data) || body.data.length > 100 || !body.data.some(item => item?.permission === 'user_photos' && item.status === 'granted')) throw permissionRequired();
    } catch (error) { if (error instanceof FacebookPhotosError && error.code === 'photos_permission_required') clear(value); throw error; }
  }
  function stillListed(owner, value, id, revision) {
    if (owners.get(owner) !== value || value.revision !== revision || (value.ids.get(id) ?? 0) <= now()) throw new FacebookPhotosError(403, 'photos_not_listed', 'Browse your tagged photos again before choosing this photo.');
  }
  return {
    clear(owner) { const value = owners.get(owner); if (value) clear(value); },
    async list(owner, access, body = {}) {
      const value = state(owner); rate(value,'list');
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'after') || (body.after !== undefined && !cursor(body.after))) throw new FacebookPhotosError(400, 'photos_invalid_request', 'Choose a valid tagged-photo page.');
      const token = accessToken(access,value); await permission(token,value);
      for (const [id,expires] of value.ids) if (expires <= now()) value.ids.delete(id);
      if (body.after && !value.cursors.has(body.after)) throw new FacebookPhotosError(400, 'photos_invalid_request', 'Reopen the tagged-photo browser before loading another page.');
      if (!body.after) clear(value);
      const revision = value.revision;
      const url = new URL(`https://graph.facebook.com/${FACEBOOK_PHOTOS_GRAPH_VERSION}/me/photos`);
      url.searchParams.set('type','tagged'); url.searchParams.set('fields','id,name,picture,width,height'); url.searchParams.set('limit','20'); if (body.after) url.searchParams.set('after',body.after);
      let payload;
      try { payload = await request(url.href,token,MAX_JSON); } catch(error) { if(error instanceof FacebookPhotosError && error.code==='photos_permission_required') clear(value); throw error; }
      if (owners.get(owner)!==value || revision!==value.revision) throw permissionRequired();
      if (!Array.isArray(payload?.data) || payload.data.length > 100) throw unavailable();
      const photos=[]; const ids=new Set();
      for (const item of payload.data.slice(0,20)) {
        if (!photoId(item?.id) || ids.has(item.id)) continue;
        const picture=typeof item.picture==='string'?item.picture:item.picture?.data?.url;
        const thumbnailUrl=facebookPhotoCdnUrl(picture,token); if(!thumbnailUrl) continue;
        const caption=typeof item.name==='string' ? item.name.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,140) : '';
        const dimensions = Number.isInteger(item.width)&&item.width>0&&item.width<=20000&&Number.isInteger(item.height)&&item.height>0&&item.height<=20000 ? {width:item.width,height:item.height}:{};
        photos.push({id:item.id,caption,thumbnailUrl,...dimensions}); ids.add(item.id); value.ids.set(item.id,now()+TTL);
        while(value.ids.size>100) value.ids.delete(value.ids.keys().next().value);
      }
      const nextCursor=payload.paging?.next && cursor(payload.paging?.cursors?.after) ? payload.paging.cursors.after : undefined;
      if(nextCursor) { value.cursors.add(nextCursor); while(value.cursors.size>5)value.cursors.delete(value.cursors.values().next().value); }
      return {photos,...(nextCursor?{nextCursor}:{})};
    },
    async import(owner, access, body) {
      const value=state(owner); rate(value,'import');
      if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>key!=='photoId')||!photoId(body.photoId)) throw new FacebookPhotosError(400,'photos_invalid_request','Choose a photo from your tagged-photo browser.');
      const token=accessToken(access,value); await permission(token,value); const revision=value.revision; stillListed(owner,value,body.photoId,revision);
      let payload;
      try {payload=await request(`https://graph.facebook.com/${FACEBOOK_PHOTOS_GRAPH_VERSION}/${body.photoId}?fields=id,images`,token,MAX_JSON);} catch(error){if(error instanceof FacebookPhotosError&&error.code==='photos_permission_required')clear(value);throw error;}
      stillListed(owner,value,body.photoId,revision);
      if(payload?.id!==body.photoId||!Array.isArray(payload.images)||payload.images.length>30)throw unavailable();
      const images=payload.images.map(item=>({url:facebookPhotoCdnUrl(item?.source,token),width:item?.width,height:item?.height})).filter(item=>item.url&&Number.isInteger(item.width)&&item.width>0&&Number.isInteger(item.height)&&item.height>0&&item.width*item.height<=50_000_000);
      images.sort((a,b)=>Math.abs(Math.max(a.width,a.height)-1280)-Math.abs(Math.max(b.width,b.height)-1280)); if(!images.length)throw invalidImage();
      const downloaded=await request(images[0].url,null,MAX_IMAGE,true); stillListed(owner,value,body.photoId,revision);
      return {dataUrl:`data:${downloaded.image.mime};base64,${downloaded.bytes.toString('base64')}`,width:downloaded.image.width,height:downloaded.image.height};
    },
  };
}
