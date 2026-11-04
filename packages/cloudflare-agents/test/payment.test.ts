import test from "node:test";
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { AUTH_TYPES, approvedPayload, eventRiskClient, guardedSigner, protectedEventRiskClient, validateAuthorization } from "../src/payment.ts";
import type { ProtectedAuthorization, SigningRequest } from "../src/payment.ts";
import { NETWORK, PRICE_ATOMS, RECIPIENT, RESOURCE_URL, USDC } from "../src/policy.ts";
import { settlementEvidence } from "../src/settlement.ts";

// Ephemeral synthetic identities only. No production wallet or network access.
const account = privateKeyToAccount(generatePrivateKey());
const domain = { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC } as const;
const requirement: PaymentRequirements = { scheme: "exact", network: NETWORK, amount: PRICE_ATOMS, asset: USDC, payTo: RECIPIENT, maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2" } };
const challenge: PaymentRequired = { x402Version: 2, resource: { url: RESOURCE_URL }, accepts: [requirement] };
async function fixture(seconds = 250) {
  const authorization = { from: account.address, to: RECIPIENT, value: PRICE_ATOMS, validAfter: "0", validBefore: String(Math.floor(Date.now() / 1000) + seconds), nonce: `0x${"12".repeat(32)}` as `0x${string}` } as const;
  const signature = await account.signTypedData({ domain, types: AUTH_TYPES, primaryType: "TransferWithAuthorization", message: { ...authorization, value: 50000n, validAfter: 0n, validBefore: BigInt(authorization.validBefore) } });
  const envelope: ProtectedAuthorization = { id: "synthetic-operation", hash: "synthetic-hash", state: "authorized", domain, types: structuredClone(AUTH_TYPES), authorization, signature };
  return { envelope, expected: { id: envelope.id, hash: envelope.hash, payer: account.address } };
}

test("pinned x402 SDK passes the strict actual signing-request guard", async () => {
  const client = eventRiskClient(account);
  const payload = await client.createPaymentPayload(challenge);
  assert.equal(payload.x402Version, 2);
  assert.equal((payload.payload.authorization as Record<string, unknown>).value, PRICE_ATOMS);
  await assert.rejects(client.createPaymentPayload(challenge), /already attempted/);
});

test("protected adapter preserves original nonce, validity and signature through the SDK", async () => {
  const { envelope, expected } = await fixture();
  const client = protectedEventRiskClient(envelope, expected);
  const payload = await client.createPaymentPayload(challenge);
  assert.deepEqual(payload.payload, { authorization: envelope.authorization, signature: envelope.signature });
  await assert.rejects(client.createPaymentPayload(challenge), /already attempted/);
});

test("a calibrated chain clock rejects a capability that a slow host still accepts", async () => {
  const { envelope, expected } = await fixture(60);
  await approvedPayload(envelope, expected);
  const clock = () => Math.floor(Date.now() / 1000) + 120;
  await assert.rejects(approvedPayload(envelope, expected, clock()), /validity/);
  await assert.rejects(protectedEventRiskClient(envelope, expected, clock).createPaymentPayload(challenge), /validity/);
});

test("protected adapter verifies signature, original intent and every signed payment field", async () => {
  const { envelope, expected } = await fixture();
  await approvedPayload(envelope, expected);
  await assert.rejects(approvedPayload(envelope, { ...expected, id: "replacement-operation" }));
  await assert.rejects(approvedPayload({ ...envelope, signature: `0x${"00".repeat(65)}` }, expected));
  for (const [field, value] of Object.entries({ from: RECIPIENT, to: account.address, value: "50001", nonce: "0x12", validAfter: String(Math.floor(Date.now() / 1000) + 100), validBefore: String(Math.floor(Date.now() / 1000) + 601) })) {
    await assert.rejects(approvedPayload({ ...envelope, authorization: { ...envelope.authorization, [field]: value } }, expected));
  }
  await assert.rejects(approvedPayload({ ...envelope, domain: { ...domain, chainId: 1 } }, expected));
  await assert.rejects(approvedPayload({ ...envelope, types: { ...envelope.types, Permit: [] } }, expected));
});

test("invalid actual SDK signing requests never reach the underlying signer", async () => {
  const { envelope } = await fixture();
  let calls = 0;
  const signer = guardedSigner({ address: account.address, async signTypedData() { calls++; throw Error("not expected"); } });
  const request: SigningRequest = { domain: { ...domain, version: "1" }, types: envelope.types, primaryType: "TransferWithAuthorization", message: envelope.authorization };
  await assert.rejects(signer.signTypedData(request), /domain/);
  assert.equal(calls, 0);
  assert.throws(() => validateAuthorization({ ...request, domain, primaryType: "ReceiveWithAuthorization" }, account.address));
});

test("protected proof cannot change during recovery and concurrent payload creation is refused", async () => {
  const { envelope, expected } = await fixture();
  const pending = approvedPayload(envelope, expected);
  envelope.authorization.value = "50001";
  assert.equal((await pending).authorization.value, PRICE_ATOMS);
  const fresh = await fixture();
  const client = protectedEventRiskClient(fresh.envelope, fresh.expected);
  const outcomes = await Promise.allSettled([client.createPaymentPayload(challenge), client.createPaymentPayload(challenge)]);
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
});

test("a receipt is provider evidence, and missing or inconsistent evidence is never settlement", () => {
  const receipt = { success: true, network: NETWORK, payer: account.address, transaction: `0x${"34".repeat(32)}` };
  const header = (value: unknown) => btoa(JSON.stringify(value));
  assert.equal(settlementEvidence(header(receipt), account.address, true).status, "provider-reported");
  assert.equal(settlementEvidence(header(receipt), account.address, false).status, "unpaid-response");
  for (const value of [null, "not-base64", header({ ...receipt, success: false }), header({ ...receipt, payer: RECIPIENT }), header({ ...receipt, transaction: "0x12" }), header({ ...receipt, network: "eip155:1" })]) {
    assert.equal(settlementEvidence(value, account.address, true).status, "unverified-response");
  }
});
