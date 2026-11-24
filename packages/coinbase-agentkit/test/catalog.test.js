// Added by Blockchain IQ. Offline: mocked fetch and a stub signer; no network, no real key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BlockchainIQActionProvider, ResourceSchema } from "../src/index.js";
import { testSigner } from "./testlib.js";

const BASE = "https://www.blockchainiq.co/api/x402/v1";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");
const wp = (s) => ({ getAddress: () => s.address, signTypedData: (td) => s.signTypedData(td) });
const CATALOG = { source: "Blockchain IQ", terms: "https://www.blockchainiq.co/terms", data: [
  { id: "catalog", method: "GET", path: "/api/x402/v1", price: "free", title: "Catalog" },
  { id: "sample", method: "GET", path: "/api/x402/v1/sample", price: "free", title: "Sample" },
  { id: "brief", method: "GET", path: "/api/x402/v1/brief", price: "$0.01", title: "Market brief" },
  { id: "event-risk", method: "GET", path: "/api/x402/v1/event-risk", price: "$0.05", title: "Event risk",
    discovery: { inputSchema: { type: "object", properties: { days: { type: "integer" } } } } },
  { id: "research", method: "GET", path: "/api/x402/v1/research/{coin}", price: "$0.05", title: "Research" },
  { id: "analyst-pack", method: "GET", path: "/api/x402/v1/analyst-pack", price: "$2.00", title: "Analyst pack" },
  { id: "evil", method: "GET", path: "//attacker.invalid/x", price: "$0.01", title: "Bad" },
] };
const AMOUNTS = { brief: 10000, "event-risk": 50000, research: 50000, "analyst-pack": 2000000 };
/** Mock server: the catalogue, a free sample, and two-rail 402 quotes (Base and Solana) for paid resources. */
function server(calls = []) {
  return async (input, init) => {
    const r = input instanceof Request ? input : new Request(input, init);
    calls.push(r.url);
    const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
    if (r.url === BASE) return json(CATALOG);
    if (r.url === `${BASE}/sample`) return json({ data: { free: true } });
    if (r.headers.get("payment-signature") || r.headers.get("x-payment")) {
      return json({ data: { url: r.url } }, 200, { "payment-response": b64({ success: true, transaction: "0xabc", network: "eip155:8453", payer: "0x1" }) });
    }
    const amount = String(AMOUNTS[Object.keys(AMOUNTS).find((k) => r.url.includes(k))]);
    return json({ error: "Payment required" }, 402, { "payment-required": b64({ x402Version: 2, error: "Payment required",
      resource: { url: r.url, mimeType: "application/json" }, accepts: [
        { scheme: "exact", network: "eip155:8453", amount, asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x617dA9383fbA67e86137BC4924b8b7E400fB7C9e", maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2" } },
        { scheme: "exact", network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", amount, asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          payTo: "473o2o4QaubXvvAFr9jikTCEirA6xhpzMSBxJpbTocLf", maxTimeoutSeconds: 300, extra: { feePayer: "BENrLoUbndxoNMUS5JXApGMtNykLjFXXixMtpDwDR9SP" } }] }) });
  };
}
const actions = (s, options = {}, calls = []) => {
  const acts = new BlockchainIQActionProvider({ fetchImpl: server(calls), ...options }).getActions(wp(s));
  return { list: acts.find((a) => a.name.endsWith("list_resources")), get: acts.find((a) => a.name.endsWith("get_resource")), all: acts };
};

test("four actions: the original two first, then list_resources and get_resource", async () => {
  const { all } = actions(await testSigner());
  assert.deepEqual(all.map((a) => a.name.replace("BlockchainIQActionProvider_", "")), ["get_market_brief", "get_event_risk", "list_resources", "get_resource"]);
});

test("list_resources is free, signs nothing and lists well-formed resources only", async () => {
  const s = await testSigner(); const calls = [];
  const list = JSON.parse(await actions(s, {}, calls).list.invoke({}));
  assert.deepEqual(list.map((r) => r.resource), ["sample", "brief", "event-risk", "research", "analyst-pack"]);
  assert.deepEqual(list.find((r) => r.resource === "research").requiredParams, ["coin"]);
  assert.equal(s.signed, 0); assert.deepEqual(calls, [BASE]);
});

test("get_resource buys from a two-rail quote on Base, with path and query parameters", async () => {
  const s = await testSigner(); const calls = [];
  const { get } = actions(s, {}, calls);
  const research = JSON.parse(await get.invoke({ resource: "research", params: { coin: "bitcoin" } }));
  assert.equal(research.data.url, `${BASE}/research/bitcoin`); assert.equal(research.price, 0.05); assert.equal(research.settlement.transaction, "0xabc");
  const risk = JSON.parse(await get.invoke({ resource: "event-risk", params: { days: 30 } }));
  assert.equal(risk.data.url, `${BASE}/event-risk?days=30`);
  assert.equal(s.signed, 2); assert.equal(calls.filter((u) => u === BASE).length, 1, "catalogue is read once");
});

test("a free resource is read without signing", async () => {
  const s = await testSigner();
  const out = JSON.parse(await actions(s).get.invoke({ resource: "sample" }));
  assert.equal(out.data.free, true); assert.equal(out.settlement, null); assert.equal(s.signed, 0);
});

test("a resource above the per-call limit is refused before any request to it; raising the limit buys it", async () => {
  const s = await testSigner(); const calls = [];
  const refused = await actions(s, {}, calls).get.invoke({ resource: "analyst-pack" });
  assert.match(refused, /^Error.*above the \$0\.05 per-call limit/); assert.equal(s.signed, 0); assert.deepEqual(calls, [BASE]);
  const bought = JSON.parse(await actions(s, { maxPerCall: 2 }).get.invoke({ resource: "analyst-pack" }));
  assert.equal(bought.price, 2); assert.equal(s.signed, 1);
});

test("maxTotal stops spending across calls", async () => {
  const s = await testSigner();
  const { get } = actions(s, { maxTotal: 0.06 });
  assert.doesNotMatch(await get.invoke({ resource: "brief" }), /^Error/);
  assert.doesNotMatch(await get.invoke({ resource: "event-risk" }), /^Error/);
  assert.match(await get.invoke({ resource: "brief" }), /^Error.*total limit/);
  assert.equal(s.signed, 2);
});

test("unknown resources, unknown parameters and unsafe path values make no paid request", async () => {
  const s = await testSigner(); const calls = [];
  const { get } = actions(s, {}, calls);
  for (const args of [{ resource: "nope" }, { resource: "evil" }, { resource: "catalog" }, { resource: "research" },
    { resource: "research", params: { coin: "../brief" } }, { resource: "research", params: { coin: "a/b" } },
    { resource: "brief", params: { url: "https://attacker.invalid" } }]) {
    assert.match(await get.invoke(args), /^Error/, JSON.stringify(args));
  }
  assert.equal(s.signed, 0); assert.ok(calls.every((u) => u === BASE));
});

test("the schema rejects extra arguments and malformed ids; the constructor rejects bad limits", () => {
  assert.equal(ResourceSchema.safeParse({ resource: "brief" }).success, true);
  assert.equal(ResourceSchema.safeParse({ resource: "brief", url: "https://attacker.invalid" }).success, false);
  assert.equal(ResourceSchema.safeParse({ resource: "Brief/../x" }).success, false);
  for (const options of [{ maxPerCall: 0 }, { maxPerCall: 26 }, { maxPerCall: "lots" }, { maxTotal: -1 }]) {
    assert.throws(() => new BlockchainIQActionProvider(options));
  }
});
