import type { PaymentRequirements } from "@x402/core/types";

export const ORIGIN = "https://www.blockchainiq.co";
export const CATALOG_URL = `${ORIGIN}/api/x402/v1`;
export const RESOURCE_URL = `${CATALOG_URL}/event-risk`;
export const NETWORK = "eip155:8453";
export const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const RECIPIENT = "0x617dA9383fbA67e86137BC4924b8b7E400fB7C9e";
export const PRICE_ATOMS = "50000";
/** No configuration can raise one call above 25.00 USDC. */
export const HARD_MAX_ATOMS = "25000000";

/**
 * Changed by Blockchain IQ: what one purchase may be. `url` is the exact URL being bought, `maxAtoms` the most it may
 * cost in USDC atomic units, and `exact` requires the price to equal `maxAtoms` (the original event-risk rule).
 */
export type ResourcePolicy = { url: string; maxAtoms: string; exact?: boolean };
export const EVENT_RISK_POLICY: ResourcePolicy = Object.freeze({ url: RESOURCE_URL, maxAtoms: PRICE_ATOMS, exact: true });

export type PaymentRequirement = {
  scheme?: unknown;
  network?: unknown;
  asset?: unknown;
  amount?: unknown;
  payTo?: unknown;
  maxTimeoutSeconds?: unknown;
  extra?: unknown;
};

function checkPolicy(policy: ResourcePolicy): bigint {
  if (!policy || typeof policy.url !== "string" || !policy.url.startsWith(`${CATALOG_URL}/`) || !/^[1-9][0-9]{0,7}$/.test(policy.maxAtoms)) throw new Error("Malformed purchase policy");
  const max = BigInt(policy.maxAtoms);
  if (max > BigInt(HARD_MAX_ATOMS)) throw new Error("Purchase policy is above the 25.00 USDC ceiling");
  return max;
}

/** Fail-closed requirement check used before the SDK is allowed to create a signature. */
export function isAllowedRequirement(value: unknown, policy: ResourcePolicy): value is PaymentRequirement {
  const max = checkPolicy(policy);
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const req = value as PaymentRequirement;
  const amount = req.amount;
  if (Object.keys(req).some((key) => !["scheme", "network", "asset", "amount", "payTo", "maxTimeoutSeconds", "extra"].includes(key))) return false;
  if (req.scheme !== "exact" || req.network !== NETWORK) return false;
  if (typeof req.asset !== "string" || req.asset.toLowerCase() !== USDC.toLowerCase()) return false;
  if (typeof amount !== "string" || !/^[1-9][0-9]{0,7}$/.test(amount) || BigInt(amount) > max || (policy.exact && amount !== policy.maxAtoms)) return false;
  if (req.payTo !== RECIPIENT) return false;
  if (!Number.isInteger(req.maxTimeoutSeconds) || Number(req.maxTimeoutSeconds) < 1 || Number(req.maxTimeoutSeconds) > 300) return false;
  const extra = req.extra;
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return false;
  const e = extra as Record<string, unknown>;
  if (e.name !== "USD Coin" || e.version !== "2") return false;
  // Explicitly disallow alternate transfer modes and extension requirements.
  if (Object.keys(e).some((key) => !["name", "version"].includes(key))) return false;
  return true;
}
export function isAllowedEventRiskRequirement(value: unknown): value is PaymentRequirement {
  return isAllowedRequirement(value, EVENT_RISK_POLICY);
}

/**
 * Changed by Blockchain IQ: the server now offers one option per rail (Base and Solana). Exactly one option must be
 * on Base and match the policy; options on other networks are ignored and never signed.
 */
export function selectAllowedRequirement(requirements: unknown, policy: ResourcePolicy = EVENT_RISK_POLICY): PaymentRequirements {
  const message = "Payment challenge does not match the single approved Blockchain IQ payment";
  if (!Array.isArray(requirements) || requirements.length < 1 || requirements.length > 8) throw new Error(message);
  const onBase = requirements.filter((r) => r && typeof r === "object" && (r as PaymentRequirement).network === NETWORK);
  if (onBase.length !== 1) throw new Error(message);
  const selected = structuredClone(onBase[0]);
  if (!isAllowedRequirement(selected, policy)) throw new Error(message);
  return selected as PaymentRequirements;
}

export function validatePaymentRequired(value: unknown, policy: ResourcePolicy = EVENT_RISK_POLICY): PaymentRequirements {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed x402 challenge");
  const challenge = value as Record<string, unknown>;
  if (challenge.x402Version !== 2) throw new Error("Only x402 v2 is enabled");
  const resource = challenge.resource;
  if (!resource || typeof resource !== "object" || Array.isArray(resource) || (resource as Record<string, unknown>).url !== policy.url) {
    throw new Error("Challenge resource does not match the approved URL");
  }
  const keys = Object.keys(challenge);
  if (keys.some((key) => !["x402Version", "error", "resource", "accepts", "extensions"].includes(key))) {
    throw new Error("Challenge has unexpected top-level fields");
  }
  const extensions = challenge.extensions;
  if (extensions !== undefined && (!extensions || typeof extensions !== "object" || Array.isArray(extensions) || Object.keys(extensions).some((key) => key !== "bazaar"))) {
    throw new Error("Challenge contains an unsupported extension");
  }
  return selectAllowedRequirement(challenge.accepts, policy);
}

export function validateInvocation(url: URL, method: string, policy: ResourcePolicy = EVENT_RISK_POLICY): void {
  if (url.href !== policy.url || method.toUpperCase() !== "GET") {
    throw new Error("Only the approved Blockchain IQ GET is enabled");
  }
}

/** "0.05" -> "50000". Plain positive dollar amounts only. */
export function usdToAtoms(value: string): string {
  if (typeof value !== "string" || !/^\d{1,4}(\.\d{1,6})?$/.test(value)) throw new Error("Malformed dollar amount");
  const [whole, fraction = ""] = value.split(".");
  const atoms = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
  if (atoms < 1n) throw new Error("Malformed dollar amount");
  return atoms.toString();
}
