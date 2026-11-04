import test from "node:test";
import assert from "node:assert/strict";
import { NETWORK, PRICE_ATOMS, RECIPIENT, RESOURCE_URL, USDC, isAllowedEventRiskRequirement, selectAllowedRequirement, validateInvocation, validatePaymentRequired } from "../src/policy.ts";

const requirement = () => ({
  scheme: "exact",
  network: NETWORK,
  amount: PRICE_ATOMS,
  asset: USDC,
  payTo: RECIPIENT,
  maxTimeoutSeconds: 300,
  extra: { name: "USD Coin", version: "2" },
});

test("accepts the observed exact five-cent Base USDC requirement", () => {
  assert.equal(RESOURCE_URL, "https://www.blockchainiq.co/api/x402/v1/event-risk");
  assert.equal(PRICE_ATOMS, "50000");
  assert.equal(isAllowedEventRiskRequirement(requirement()), true);
  assert.equal(selectAllowedRequirement([requirement()]).payTo, RECIPIENT);
});

test("the separate one-cent brief invoice cannot authorize an event-risk purchase", () => {
  assert.equal(isAllowedEventRiskRequirement({ ...requirement(), amount: "10000" }), false);
  assert.throws(() => validateInvocation(new URL("https://www.blockchainiq.co/api/x402/v1/brief"), "GET"));
  assert.throws(() => validatePaymentRequired({ x402Version: 2, resource: { url: "https://www.blockchainiq.co/api/x402/v1/brief" }, accepts: [requirement()] }));
});

test("rejects changed or ambiguous payment terms", () => {
  for (const patch of [
    { scheme: "upto" },
    { network: "eip155:1" },
    { asset: "0x0000000000000000000000000000000000000001" },
    { amount: "50001" },
    { payTo: "0x0000000000000000000000000000000000000001" },
    { maxTimeoutSeconds: 301 },
    { extra: { name: "USD Coin", version: "2", transferMode: "alternative" } },
    { facilitatorHint: "unexpected" },
  ]) assert.equal(isAllowedEventRiskRequirement({ ...requirement(), ...patch }), false);
  assert.throws(() => selectAllowedRequirement([requirement(), requirement()]));
});

test("accepts only the fixed GET resource and exact current challenge", () => {
  validateInvocation(new URL(RESOURCE_URL), "GET");
  assert.throws(() => validateInvocation(new URL(RESOURCE_URL), "POST"));
  assert.throws(() => validateInvocation(new URL("https://example.invalid/"), "GET"));
  assert.doesNotThrow(() => validatePaymentRequired({
    x402Version: 2,
    error: "Payment required",
    resource: { url: RESOURCE_URL },
    accepts: [requirement()],
    extensions: { bazaar: { info: { input: { type: "http", method: "GET", queryParams: {} } } } },
  }));
  assert.throws(() => validatePaymentRequired({ x402Version: 2, resource: { url: "https://evil.invalid" }, accepts: [requirement()] }));
  assert.throws(() => validatePaymentRequired({ x402Version: 2, resource: { url: RESOURCE_URL }, accepts: [requirement()], extensions: { unknown: {} } }));
});
