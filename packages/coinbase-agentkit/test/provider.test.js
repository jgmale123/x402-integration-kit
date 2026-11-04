import { test } from "node:test";
import assert from "node:assert/strict";
import { BlockchainIQActionProvider } from "../src/index.js";
import { mockFetch, testSigner } from "./testlib.js";

const wp = (s) => ({ getAddress: () => s.address, signTypedData: (td) => s.signTypedData(td) });

test("supportsNetwork only Base mainnet", () => {
  const p = new BlockchainIQActionProvider();
  assert.equal(p.supportsNetwork({ protocolFamily: "evm", networkId: "base-mainnet", chainId: "8453" }), true);
  assert.equal(p.supportsNetwork({ protocolFamily: "evm", networkId: "base-sepolia", chainId: "84532" }), false);
  assert.equal(p.supportsNetwork({ protocolFamily: "svm" }), false);
});

test("exposes two actions; brief pays and returns settlement", async () => {
  const s = await testSigner();
  const acts = new BlockchainIQActionProvider({ fetchImpl: mockFetch(10000) }).getActions(wp(s));
  assert.deepEqual(acts.map((a) => a.name), ["BlockchainIQActionProvider_get_market_brief", "BlockchainIQActionProvider_get_event_risk"]);
  const out = JSON.parse(await acts[0].invoke({}));
  assert.equal(out.settlement.transaction, "0xabc");
  assert.equal(s.signed, 1);
});

test("refuses over-cap payment without signing", async () => {
  const s = await testSigner();
  const acts = new BlockchainIQActionProvider({ fetchImpl: mockFetch(1000000) }).getActions(wp(s));
  const out = await acts[0].invoke({});
  assert.match(out, /^Error/);
  assert.equal(s.signed, 0);
});

import { mockFetchPaid, mockFetch402Only } from "./testlib.js";

test("402 challenge: paid retry succeeds, one signature, URL is the brief endpoint", async () => {
  const s = await testSigner();
  const calls = [];
  const acts = new BlockchainIQActionProvider({ fetchImpl: mockFetch(10000, calls) }).getActions(wp(s));
  await acts[0].invoke({});
  assert.equal(s.signed, 1);
  assert.equal(calls.length, 2); // unpaid 402 then paid retry
  assert.ok(calls.every((u) => u === "https://www.blockchainiq.co/api/x402/v1/brief"));
});

test("unsatisfied 402 (server keeps demanding payment) returns an Error string", async () => {
  const s = await testSigner();
  const acts = new BlockchainIQActionProvider({ fetchImpl: mockFetch402Only(10000) }).getActions(wp(s));
  const out = await acts[0].invoke({});
  assert.match(out, /^Error calling Blockchain IQ brief/);
  assert.match(out, /402/);
});

test("HTTP error after payment returns an Error string with status", async () => {
  const s = await testSigner();
  const acts = new BlockchainIQActionProvider({ fetchImpl: mockFetchPaid(500, JSON.stringify({ error: "boom" })) }).getActions(wp(s));
  const out = await acts[0].invoke({});
  assert.match(out, /^Error calling Blockchain IQ brief/);
  assert.match(out, /HTTP 500/);
});

test("malformed body (not JSON) on a 200 does not throw; data is an empty object", async () => {
  const s = await testSigner();
  const acts = new BlockchainIQActionProvider({ fetchImpl: mockFetchPaid(200, "<html>not json") }).getActions(wp(s));
  const out = JSON.parse(await acts[0].invoke({}));
  assert.deepEqual(out.data, {});
  assert.equal(out.settlement, null);
});

test("event-risk action builds the days query", async () => {
  const s = await testSigner();
  const calls = [];
  const acts = new BlockchainIQActionProvider({ fetchImpl: mockFetch(50000, calls) }).getActions(wp(s));
  await acts[1].invoke({ days: 3 });
  assert.ok(calls.every((u) => u === "https://www.blockchainiq.co/api/x402/v1/event-risk?days=3"));
});
