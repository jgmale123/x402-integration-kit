import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";

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

/** Make one call; returns { data, settlement } where settlement has the tx hash. */
export async function callBlockchainIQ(payFetch, resource, opts = {}) {
  const res = await payFetch(buildUrl(resource, opts));
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Blockchain IQ ${resource} failed: HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  const header = res.headers.get("payment-response");
  const settlement = header ? decodePaymentResponseHeader(header) : null;
  return { data: body.data ?? body, settlement };
}
