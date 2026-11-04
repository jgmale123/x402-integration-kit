import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { recoverTypedDataAddress } from "viem";
import { NETWORK, PRICE_ATOMS, RECIPIENT, USDC, validatePaymentRequired, selectAllowedRequirement } from "./policy.ts";

export const AUTH_TYPES = { TransferWithAuthorization: [
  { name: "from", type: "address" }, { name: "to", type: "address" },
  { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
] } as const;
export type SigningRequest = { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> };
export type BriefSigner = { address: `0x${string}`; signTypedData(request: SigningRequest): Promise<`0x${string}`> };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).sort().join(",") === [...expected].sort().join(",");
const address = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
const uint = (v: unknown) => typeof v === "bigint" && v >= 0n ? v : typeof v === "string" && /^(0|[1-9][0-9]*)$/.test(v) ? BigInt(v) : null;

/** Validate the actual signing request, including fields generated inside the SDK. */
export function validateAuthorization(request: SigningRequest, payer: string, now = Math.floor(Date.now() / 1000)): void {
  const { domain: d, types, message: m } = request;
  if (!record(d) || !record(m) || !record(types) || request.primaryType !== "TransferWithAuthorization") throw Error("Unsupported authorization type");
  if (!keys(d, ["name", "version", "chainId", "verifyingContract"]) || d.name !== "USD Coin" || d.version !== "2" || d.chainId !== 8453 || !address(d.verifyingContract, USDC)) throw Error("Unexpected signing domain");
  if (!keys(types, ["TransferWithAuthorization"]) || JSON.stringify(types) !== JSON.stringify(AUTH_TYPES)) throw Error("Unexpected authorization schema");
  if (!keys(m, ["from", "to", "value", "validAfter", "validBefore", "nonce"]) || !address(m.from, payer) || !address(m.to, RECIPIENT) || uint(m.value) !== BigInt(PRICE_ATOMS)) throw Error("Unexpected authorization payment terms");
  const after = uint(m.validAfter), before = uint(m.validBefore);
  if (after === null || before === null || after > BigInt(now) || before < BigInt(now + 6) || before > BigInt(now + 300) || before <= after) throw Error("Authorization is outside the allowed remaining validity window");
  if (typeof m.nonce !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(m.nonce)) throw Error("Malformed authorization nonce");
}

export function guardedSigner(signer: BriefSigner, clock = () => Math.floor(Date.now() / 1000)): BriefSigner {
  let consumed = false;
  return { address: signer.address, async signTypedData(request) {
    if (consumed) throw Error("A signature was already attempted; reconcile the original operation");
    const snapshot = structuredClone(request);
    validateAuthorization(snapshot, signer.address, clock());
    consumed = true;
    return signer.signTypedData(snapshot);
  } };
}

export type ProtectedAuthorization = {
  id: string; hash: string; state: string; domain: Record<string, unknown>;
  types: Record<string, unknown>; authorization: Record<string, unknown>; signature: `0x${string}`;
};

/** Use the original protected authorization; never substitute it into an SDK-generated nonce. */
export async function approvedPayload(envelope: ProtectedAuthorization, expected: { id: string; hash: string; payer: string }, now = Math.floor(Date.now() / 1000)) {
  envelope = structuredClone(envelope);
  if (!envelope || envelope.state !== "authorized" || envelope.id !== expected.id || envelope.hash !== expected.hash) throw Error("Protected intent does not match the configured operation");
  const request = { domain: envelope.domain, types: envelope.types, primaryType: "TransferWithAuthorization", message: envelope.authorization };
  validateAuthorization(request, expected.payer, now);
  const m = envelope.authorization;
  const recovered = await recoverTypedDataAddress({
    domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC },
    types: AUTH_TYPES, primaryType: "TransferWithAuthorization",
    message: { from: m.from as `0x${string}`, to: m.to as `0x${string}`, value: BigInt(String(m.value)), validAfter: BigInt(String(m.validAfter)), validBefore: BigInt(String(m.validBefore)), nonce: m.nonce as `0x${string}` },
    signature: envelope.signature,
  });
  if (!address(recovered, expected.payer)) throw Error("Protected signature does not recover the configured payer");
  return { authorization: { ...envelope.authorization }, signature: envelope.signature };
}

export function protectedEventRiskClient(envelope: ProtectedAuthorization, expected: { id: string; hash: string; payer: string }, clock = () => Math.floor(Date.now() / 1000)) {
  let consumed = false;
  const client = x402Client.fromConfig({
    schemes: [{ network: NETWORK, client: { scheme: "exact", async createPaymentPayload(version, requirement) {
      if (consumed) throw Error("The original authorization was already attempted; reconcile before proceeding");
      if (version !== 2) throw Error("Only x402 v2 is enabled");
      selectAllowedRequirement([requirement]);
      consumed = true;
      const payload = await approvedPayload(envelope, expected, clock());
      return { x402Version: 2, payload };
    } } }],
    spendControls: { allowedAssets: [{ network: NETWORK, asset: USDC, maxAmountPerPayment: PRICE_ATOMS }] },
    paymentRequirementsSelector: (_version, requirements) => selectAllowedRequirement(requirements),
  });
  client.onBeforePaymentCreation(async ({ paymentRequired }) => { validatePaymentRequired(paymentRequired); });
  return client;
}

export function eventRiskClient(signer: BriefSigner, clock = () => Math.floor(Date.now() / 1000)) {
  const client = x402Client.fromConfig({
    schemes: [{ network: NETWORK, client: new ExactEvmScheme(guardedSigner(signer, clock)) }],
    spendControls: { allowedAssets: [{ network: NETWORK, asset: USDC, maxAmountPerPayment: PRICE_ATOMS }] },
    paymentRequirementsSelector: (_version, requirements) => selectAllowedRequirement(requirements),
  });
  client.onBeforePaymentCreation(async ({ paymentRequired }) => { validatePaymentRequired(paymentRequired); });
  return client;
}
