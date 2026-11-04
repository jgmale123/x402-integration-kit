import type { PaymentRequirements } from "@x402/core/types";

export const RESOURCE_URL = "https://www.blockchainiq.co/api/x402/v1/event-risk";
export const NETWORK = "eip155:8453";
export const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const RECIPIENT = "0x617dA9383fbA67e86137BC4924b8b7E400fB7C9e";
export const PRICE_ATOMS = "50000";

export type PaymentRequirement = {
  scheme?: unknown;
  network?: unknown;
  asset?: unknown;
  amount?: unknown;
  payTo?: unknown;
  maxTimeoutSeconds?: unknown;
  extra?: unknown;
};

/** Fail-closed requirement check used before the SDK is allowed to create a signature. */
export function isAllowedEventRiskRequirement(value: unknown): value is PaymentRequirement {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const req = value as PaymentRequirement;
  const amount = req.amount;
  if (Object.keys(req).some((key) => !["scheme", "network", "asset", "amount", "payTo", "maxTimeoutSeconds", "extra"].includes(key))) return false;
  if (req.scheme !== "exact" || req.network !== NETWORK) return false;
  if (typeof req.asset !== "string" || req.asset.toLowerCase() !== USDC.toLowerCase()) return false;
  if (amount !== PRICE_ATOMS || req.payTo !== RECIPIENT) return false;
  if (!Number.isInteger(req.maxTimeoutSeconds) || Number(req.maxTimeoutSeconds) < 1 || Number(req.maxTimeoutSeconds) > 300) return false;
  const extra = req.extra;
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return false;
  const e = extra as Record<string, unknown>;
  if (e.name !== "USD Coin" || e.version !== "2") return false;
  // Explicitly disallow alternate transfer modes and extension requirements.
  if (Object.keys(e).some((key) => !["name", "version"].includes(key))) return false;
  return true;
}

export function selectAllowedRequirement(requirements: unknown): PaymentRequirements {
  if (!Array.isArray(requirements) || requirements.length !== 1) {
    throw new Error("Payment challenge does not match the single approved Blockchain IQ event-risk payment");
  }
  const selected = structuredClone(requirements[0]);
  if (!isAllowedEventRiskRequirement(selected)) throw new Error("Payment challenge does not match the single approved Blockchain IQ event-risk payment");
  return selected as PaymentRequirements;
}

export function validatePaymentRequired(value: unknown): PaymentRequirements {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed x402 challenge");
  const challenge = value as Record<string, unknown>;
  if (challenge.x402Version !== 2) throw new Error("Only x402 v2 is enabled");
  const resource = challenge.resource;
  if (!resource || typeof resource !== "object" || Array.isArray(resource) || (resource as Record<string, unknown>).url !== RESOURCE_URL) {
    throw new Error("Challenge resource does not match the approved brief URL");
  }
  const keys = Object.keys(challenge);
  if (keys.some((key) => !["x402Version", "error", "resource", "accepts", "extensions"].includes(key))) {
    throw new Error("Challenge has unexpected top-level fields");
  }
  const extensions = challenge.extensions;
  if (extensions !== undefined && (!extensions || typeof extensions !== "object" || Array.isArray(extensions) || Object.keys(extensions).some((key) => key !== "bazaar"))) {
    throw new Error("Challenge contains an unsupported extension");
  }
  return selectAllowedRequirement(challenge.accepts);
}

export function validateInvocation(url: URL, method: string): void {
  if (url.href !== RESOURCE_URL || method.toUpperCase() !== "GET") {
    throw new Error("Only the approved Blockchain IQ event-risk GET is enabled");
  }
}

