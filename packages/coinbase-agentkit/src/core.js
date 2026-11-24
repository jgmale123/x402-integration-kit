import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { buildUrl as buildCatalogUrl, listResources, parseCatalog } from "./catalog.js";
export { listResources, parseCatalog } from "./catalog.js";

export const BASE_URL = "https://www.blockchainiq.co/api/x402/v1";
export const RESOURCES = {
  brief: { path: "/brief", price: 0.01 },
  "event-risk": { path: "/event-risk", price: 0.05 },
};
export const DEFAULT_MAX_PER_CALL = 0.05; // USD

/**
 * Build a paying fetch for Blockchain IQ.
 * signer: { address, signTypedData } (a viem LocalAccount works).
 * Only Base mainnet (eip155:8453) "exact" payments are registered, and any
 * payment above maxPerCall dollars is refused before anything is signed.
 */
export function createPayFetch(signer, { maxPerCall = DEFAULT_MAX_PER_CALL, fetchImpl = fetch } = {}) {
  if (!signer?.address || typeof signer.signTypedData !== "function") {
    throw new Error("signer must expose address and signTypedData");
  }
  const client = x402Client.fromConfig({
    schemes: [{ network: "eip155:8453", client: new ExactEvmScheme(signer) }],
    spendControls: { maxAmountPerPayment: maxPerCall },
  });
  return wrapFetchWithPayment(fetchImpl, client);
}

export function buildUrl(resource, { days } = {}) {
  const r = RESOURCES[resource];
  if (!r) throw new Error(`unknown resource "${resource}" (use brief or event-risk)`);
  const u = new URL(BASE_URL + r.path);
  if (resource === "event-risk" && days) u.searchParams.set("days", String(days));
  return u.toString();
}

// Added by Blockchain IQ (see CHANGES.md): every resource in the live catalogue, not only the two above.

/** Free. Reads the catalogue once and returns a Map of resource id -> { path, price, priceUnits, pathParams, queryParams }. */
export async function loadCatalog(fetchImpl = fetch) {
  const res = await fetchImpl(BASE_URL, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Blockchain IQ catalogue failed: HTTP ${res.status}`);
  return parseCatalog(await res.json());
}

/**
 * Buy (or, for a free resource, just read) one catalogue resource by id.
 * The price is checked against maxPerCall before any request to the resource, and the URL is built
 * on the fixed Blockchain IQ origin from the resource's listed parameters only.
 * budget: optional { maxTotal, spent } in USD; a call that would pass maxTotal is refused.
 */
export async function callResource(payFetch, catalog, resource, params = {}, { maxPerCall = DEFAULT_MAX_PER_CALL, budget, fetchImpl = fetch } = {}) {
  const entry = catalog.get(resource);
  if (!entry || resource === "catalog") throw new Error(`unknown resource "${resource}" (list them with the list_resources action)`);
  const url = buildCatalogUrl(entry, params);
  const price = Number(entry.priceUnits) / 1e6;
  if (price === 0) {
    const res = await fetchImpl(url, { headers: { accept: "application/json" } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Blockchain IQ ${resource} failed: HTTP ${res.status}`);
    return { data: body.data ?? body, settlement: null, price: 0 };
  }
  if (price > maxPerCall) throw new Error(`${resource} costs $${price.toFixed(2)}, above the $${Number(maxPerCall).toFixed(2)} per-call limit; nothing was signed`);
  if (budget && budget.maxTotal != null && budget.spent + price > budget.maxTotal + 1e-9) {
    throw new Error(`${resource} would pass the $${Number(budget.maxTotal).toFixed(2)} total limit; nothing was signed`);
  }
  if (budget) budget.spent += price; // reserved before signing and never refunded automatically
  const res = await payFetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Blockchain IQ ${resource} failed: HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  const header = res.headers.get("payment-response");
  return { data: body.data ?? body, settlement: header ? decodePaymentResponseHeader(header) : null, price };
}

/** Make one call; returns { data, settlement } where settlement has the tx hash. */
export async function callBlockchainIQ(payFetch, resource, opts = {}) {
  const res = await payFetch(buildUrl(resource, opts));
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Blockchain IQ ${resource} failed: HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  const header = res.headers.get("payment-response");
  const settlement = header ? decodePaymentResponseHeader(header) : null;
  return { data: body.data ?? body, settlement };
}
