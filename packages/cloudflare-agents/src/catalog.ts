// Added by Blockchain IQ (see CHANGES.md). Reads the free catalogue and turns a resource id plus parameters into
// one URL on the fixed Blockchain IQ origin. Nothing here can name another host.
import { ORIGIN } from "./policy.ts";

const PATH = /^\/api\/x402\/v1(\/(\{[A-Za-z][A-Za-z0-9]{0,31}\}|[A-Za-z0-9][A-Za-z0-9._-]{0,127}))*$/;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export type CatalogResource = {
  id: string; path: string; price: string; priceAtoms: string; title: string;
  pathParams: readonly string[]; queryParams: readonly string[];
};

function priceAtoms(price: unknown): string | null {
  if (price === "free") return "0";
  const m = typeof price === "string" ? /^\$(\d{1,4})\.(\d{2})$/.exec(price) : null;
  return m ? (BigInt(m[1]) * 1000000n + BigInt(m[2]) * 10000n).toString() : null;
}

/** Keeps only well-formed GET entries; a malformed entry is skipped, never trusted. */
export function parseCatalog(json: unknown): Map<string, CatalogResource> {
  const body = json as { source?: unknown; terms?: unknown; data?: unknown } | null;
  if (!body || body.source !== "Blockchain IQ" || body.terms !== "https://www.blockchainiq.co/terms" || !Array.isArray(body.data) || body.data.length > 2000) throw new Error("INVALID_CATALOG");
  const resources = new Map<string, CatalogResource>();
  for (const entry of body.data as Record<string, unknown>[]) {
    const atoms = priceAtoms(entry?.price);
    if (!entry || typeof entry.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.id) || entry.method !== "GET" ||
        typeof entry.path !== "string" || !PATH.test(entry.path) || atoms === null || resources.has(entry.id)) continue;
    const properties = (entry.discovery as { inputSchema?: { properties?: unknown } } | undefined)?.inputSchema?.properties;
    resources.set(entry.id, Object.freeze({
      id: entry.id, path: entry.path, price: entry.price as string, priceAtoms: atoms,
      title: typeof entry.title === "string" ? entry.title.slice(0, 200) : entry.id,
      pathParams: Object.freeze([...entry.path.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((m) => m[1])),
      queryParams: Object.freeze(properties && typeof properties === "object" ? Object.keys(properties).filter((k) => /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(k)) : []),
    }));
  }
  if (resources.size === 0) throw new Error("INVALID_CATALOG");
  return resources;
}

export function listResources(resources: Map<string, CatalogResource>) {
  return [...resources.values()].filter((r) => r.id !== "catalog").map((r) => ({
    resource: r.id, price: r.price, title: r.title,
    ...(r.pathParams.length ? { requiredParams: r.pathParams } : {}),
    ...(r.queryParams.length ? { optionalParams: r.queryParams } : {}),
  }));
}

/** Path parameters are required and limited to one safe segment; query parameters must be ones the catalogue lists. */
export function buildUrl(resource: CatalogResource, params: unknown = {}): string {
  if (!resource || params === null || typeof params !== "object" || Array.isArray(params)) throw new Error("INVALID_PARAMS");
  const given = params as Record<string, unknown>;
  const known = new Set([...resource.pathParams, ...resource.queryParams]);
  for (const key of Object.keys(given)) if (!known.has(key)) throw new Error("INVALID_PARAMS");
  let path = resource.path;
  for (const name of resource.pathParams) {
    const value = given[name];
    if (typeof value !== "string" || !SEGMENT.test(value) || value.includes("..")) throw new Error("INVALID_PARAMS");
    path = path.replace(`{${name}}`, value);
  }
  const query = new URLSearchParams();
  for (const name of resource.queryParams) {
    const value = given[name];
    if (value === undefined) continue;
    if (!["string", "number", "boolean"].includes(typeof value) || String(value).length < 1 || String(value).length > 256 ||
        (typeof value === "number" && !Number.isFinite(value))) throw new Error("INVALID_PARAMS");
    query.set(name, String(value));
  }
  const text = query.toString();
  const url = new URL(`${ORIGIN}${path}${text ? `?${text}` : ""}`);
  if (url.origin !== ORIGIN || !url.pathname.startsWith("/api/x402/v1/") || url.username || url.password || url.hash) throw new Error("INVALID_PARAMS");
  return url.href;
}
