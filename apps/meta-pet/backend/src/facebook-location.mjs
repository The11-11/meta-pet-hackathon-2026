// Match the Facebook Graph version used by installed Better Auth 1.7.12.
export const FACEBOOK_GRAPH_VERSION = 'v24.0';
export const FACEBOOK_LOCATION_SCOPES = {
  profile: ['user_location'],
  pages: ['pages_show_list', 'pages_read_engagement'],
};
const MAX_GRAPH_BYTES = 128 * 1_024;
const MAX_AREA_CHARACTERS = 100;
const permissionMessage = source => source === 'pages'
  ? 'Allow Facebook Page access to use the city listed on a Page you manage.'
  : 'Allow Facebook city access to use the city listed on your profile.';
const result = (status, message, locations = []) => ({ status, locations, message });

function cleanText(value, max = 120) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text || /https?:|www\.|[<>]/i.test(text)) return '';
  return text.slice(0, max);
}

function coarseArea(parts) {
  const unique = [...new Set(parts.filter(Boolean))];
  if (!unique.length) return '';
  let area = unique[0].slice(0, MAX_AREA_CHARACTERS);
  for (const piece of unique.slice(1)) {
    // Keep complete state/country components instead of cutting mid-name.
    if (area.length + 2 + piece.length <= MAX_AREA_CHARACTERS) area += ', ' + piece;
  }
  return area;
}

async function boundedJson(response) {
  if (Number(response.headers?.get('content-length')) > MAX_GRAPH_BYTES || !response.body?.getReader) throw new Error('Invalid Graph response.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_GRAPH_BYTES) throw new Error('Graph response exceeded the limit.');
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function profileLocations(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (body.location == null) return [];
  if (typeof body.location !== 'object' || Array.isArray(body.location)) return null;
  const area = coarseArea(cleanText(body.location.name, 400).split(',').map(piece => piece.trim()));
  return area ? [{ id: 'facebook-profile-city', source: 'facebook_profile', label: 'Facebook profile city', area }] : [];
}

function pageLocations(body) {
  if (!body || !Array.isArray(body.data)) return null;
  const locations = [];
  const seen = new Set();
  // Never follow Graph paging links or include street addresses/coordinates.
  for (const page of body.data.slice(0, 25)) {
    if (!page || !/^\d{1,40}$/.test(page.id ?? '') || seen.has(page.id)) continue;
    const city = cleanText(page.location?.city, 80);
    if (!city) continue;
    const pieces = [city, cleanText(page.location?.state, 80), cleanText(page.location?.country, 80)].filter(Boolean);
    const area = coarseArea(pieces);
    seen.add(page.id);
    locations.push({ id: 'facebook-page-' + page.id, source: 'facebook_page', label: cleanText(page.name, 80) || 'Facebook Page', area });
  }
  return locations;
}

/** Only returns coarse profile/Page areas. Provider tokens never leave this call. */
export async function readFacebookLocations({ source, access, fetchImpl = fetch, timeoutMs = 8_000 } = {}) {
  if (!Object.hasOwn(FACEBOOK_LOCATION_SCOPES, source ?? '')) throw new TypeError('Choose profile or pages.');
  const token = access?.token;
  if (typeof token !== 'string' || !token.trim() || token.length > 8_192 || /[\r\n]/.test(token)) {
    return result('permission_required', 'Connect your Facebook account to import its city or Page area.');
  }
  const scopes = Array.isArray(access.scopes) ? access.scopes : [];
  if (!FACEBOOK_LOCATION_SCOPES[source].every(scope => scopes.includes(scope))) {
    return result('permission_required', permissionMessage(source));
  }
  const url = new URL('https://graph.facebook.com/' + FACEBOOK_GRAPH_VERSION + '/' + (source === 'pages' ? 'me/accounts' : 'me'));
  url.searchParams.set('fields', source === 'pages' ? 'id,name,location{city,country,state}' : 'location{id,name}');
  if (source === 'pages') url.searchParams.set('limit', '25');
  const controller = new AbortController();
  let timer;
  try {
    const timedOut = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Facebook location request timed out.')); }, timeoutMs);
    });
    const payload = (async () => {
      const response = await fetchImpl(url.toString(), {
        method: 'GET', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        signal: controller.signal, redirect: 'error',
      });
      const body = await boundedJson(response);
      return { response, body };
    })();
    const { response, body } = await Promise.race([payload, timedOut]);
    if (!response.ok || body?.error) {
      const code = Number(body?.error?.code);
      if ([401, 403].includes(response.status) || [10, 102, 190, 200].includes(code)) {
        return result('permission_required', permissionMessage(source));
      }
      return result('unavailable', 'Facebook could not supply this area. Please try again later.');
    }
    const locations = source === 'pages' ? pageLocations(body) : profileLocations(body);
    if (!locations) return result('unavailable', 'Facebook returned an area that could not be read. Please try again later.');
    if (!locations.length) return result('no_location', source === 'pages'
      ? 'No city was shared on the accessible Facebook Pages. Choose another source or add a city on Facebook.'
      : 'Facebook did not share a profile city. Choose another source or add a city on Facebook.');
    return result('available', 'Choose the area you want Muse to use for local trainer searches.', locations);
  } catch {
    return result('unavailable', 'Facebook could not supply this area. Please try again later.');
  } finally { clearTimeout(timer); controller.abort(); }
}
