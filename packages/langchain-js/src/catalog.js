// Added by Blockchain IQ (see CHANGES.md). Reads the free catalogue and turns a resource id plus
// parameters into one URL on the fixed Blockchain IQ origin. Nothing here can name another host.
import { fail, POLICY } from './policy.js';

const PATH = /^\/api\/x402\/v1(\/(\{[A-Za-z][A-Za-z0-9]{0,31}\}|[A-Za-z0-9][A-Za-z0-9._-]{0,127}))*$/;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function priceUnits(price) {
  if (price === 'free') return 0n;
  const m = typeof price === 'string' && /^\$(\d{1,4})\.(\d{2})$/.exec(price);
  return m ? BigInt(m[1]) * 1000000n + BigInt(m[2]) * 10000n : null;
}

/** Keeps only well-formed GET entries; a malformed entry is skipped, never trusted. */
export function parseCatalog(json) {
  if (!json || json.source !== 'Blockchain IQ' || json.terms !== 'https://www.blockchainiq.co/terms' ||
      !Array.isArray(json.data) || json.data.length > 2000) fail('INVALID_CATALOG');
  const resources = new Map();
  for (const entry of json.data) {
    const units = priceUnits(entry?.price);
    if (!entry || typeof entry.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.id) || entry.method !== 'GET' ||
        typeof entry.path !== 'string' || !PATH.test(entry.path) || units === null || resources.has(entry.id)) continue;
    const properties = entry.discovery?.inputSchema?.properties;
    resources.set(entry.id, Object.freeze({
      id: entry.id, path: entry.path, price: entry.price, priceUnits: units,
      title: typeof entry.title === 'string' ? entry.title.slice(0, 200) : entry.id,
      description: typeof entry.description === 'string' ? entry.description.slice(0, 600) : '',
      pathParams: Object.freeze([...entry.path.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map(m => m[1])),
      queryParams: Object.freeze(properties && typeof properties === 'object'
        ? Object.keys(properties).filter(k => /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(k)) : []),
    }));
  }
  if (resources.size === 0) fail('INVALID_CATALOG');
  return resources;
}

/** A short list an agent can read to choose a resource. */
export function listResources(resources) {
  return [...resources.values()].filter(r => r.id !== 'catalog').map(r => ({
    resource: r.id, price: r.price, title: r.title, description: r.description,
    ...(r.pathParams.length ? { requiredParams: r.pathParams } : {}),
    ...(r.queryParams.length ? { optionalParams: r.queryParams } : {}),
  }));
}

/** Path parameters are required and limited to one safe segment; query parameters must be ones the catalogue lists. */
export function buildUrl(resource, params = {}) {
  if (!resource || params === null || typeof params !== 'object' || Array.isArray(params)) fail('INVALID_PARAMS');
  const known = new Set([...resource.pathParams, ...resource.queryParams]);
  for (const key of Object.keys(params)) if (!known.has(key)) fail('INVALID_PARAMS');
  let path = resource.path;
  for (const name of resource.pathParams) {
    const value = params[name];
    if (typeof value !== 'string' || !SEGMENT.test(value) || value.includes('..')) fail('INVALID_PARAMS');
    path = path.replace(`{${name}}`, value);
  }
  const query = new URLSearchParams();
  for (const name of resource.queryParams) {
    const value = params[name];
    if (value === undefined) continue;
    if (!['string', 'number', 'boolean'].includes(typeof value) || String(value).length < 1 || String(value).length > 256 ||
        (typeof value === 'number' && !Number.isFinite(value))) fail('INVALID_PARAMS');
    query.set(name, String(value));
  }
  const text = query.toString();
  const url = new URL(`${POLICY.origin}${path}${text ? `?${text}` : ''}`);
  if (url.origin !== POLICY.origin || !url.pathname.startsWith('/api/x402/v1/') || url.username || url.password || url.hash) fail('INVALID_PARAMS');
  return url.href;
}
