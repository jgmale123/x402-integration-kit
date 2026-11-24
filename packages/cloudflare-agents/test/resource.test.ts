import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { CATALOG_URL, NETWORK, RECIPIENT, USDC, selectAllowedRequirement, usdToAtoms, validatePaymentRequired } from "../src/policy.ts";
import { buildUrl, listResources, parseCatalog } from "../src/catalog.ts";
import { readLimits } from "../src/limits.ts";

// Added by Blockchain IQ: offline tests for the any-resource route (GET /catalog, POST /resource, GET /ledger).
// All outbound HTTP is answered by a local fixture; no request leaves the machine.
// The wallet key is generated in memory for each test and is never printed.

const root = fileURLToPath(new URL("../", import.meta.url));
execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "deploy", "--dry-run", "--outdir", ".wrangler-dry-run"], { cwd: root, stdio: "pipe", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });

const entry = (id: string, path: string, price: string, properties?: Record<string, unknown>) => ({ id, method: "GET", path, price, title: id, ...(properties ? { discovery: { inputSchema: { properties } } } : {}) });
const CATALOG = { source: "Blockchain IQ", terms: "https://www.blockchainiq.co/terms", data: [
  entry("catalog", "/api/x402/v1", "free"),
  entry("sample", "/api/x402/v1/sample", "free"),
  entry("brief", "/api/x402/v1/brief", "$0.01"),
  entry("calendar", "/api/x402/v1/calendar", "$0.03"),
  entry("event-risk", "/api/x402/v1/event-risk", "$0.05", { days: {}, minImportance: {} }),
  entry("network", "/api/x402/v1/network/{chain}", "$0.03"),
  entry("analyst-pack", "/api/x402/v1/analyst-pack", "$2.00"),
  { id: "poster", method: "POST", path: "/api/x402/v1/poster", price: "$0.01" },
  entry("elsewhere", "/other/path", "$0.01"),
] };
const baseOption = (amount: string) => ({ scheme: "exact", network: NETWORK, amount, asset: USDC, payTo: RECIPIENT, maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2" } });
const solanaOption = (amount: string) => ({ scheme: "exact", network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", amount, asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", payTo: "So1anaPayee1111111111111111111111111111111", maxTimeoutSeconds: 300, extra: { feePayer: "So1anaFeePayer11111111111111111111111111111" } });
const challenge = (url: string, accepts: unknown[]) => new Response("{}", { status: 402, headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify({ x402Version: 2, resource: { url }, accepts })), "Content-Type": "application/json" } });
const envelope = (data: unknown) => JSON.stringify({ source: "Blockchain IQ", terms: "https://www.blockchainiq.co/terms", data });

type Quote = (url: string) => unknown[];
type Ctx = { get: (path: string) => Promise<Response>; post: (body: unknown) => Promise<Response>; seen: string[]; signed: () => number };

async function withWorker(vars: Record<string, string>, quote: Quote, run: (ctx: Ctx) => Promise<void>, options: { protectedSource?: boolean } = {}) {
  const key = generatePrivateKey();
  const payer = privateKeyToAccount(key).address;
  const token = randomBytes(32).toString("hex");
  const seen: string[] = [];
  let signed = 0;
  const source: Record<string, string> = options.protectedSource
    ? { PROJECT_PAYMENT_AUTHORIZATION: "{}", PROJECT_OPERATION_ID: "x", PROJECT_INTENT_HASH: "y", PROJECT_PAYER_ADDRESS: payer }
    : { PROJECT_EVM_PRIVATE_KEY: key };
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, scriptPath: fileURLToPath(new URL("../.wrangler-dry-run/index.js", import.meta.url)),
    compatibilityDate: "2026-10-25", compatibilityFlags: ["nodejs_compat"],
    durableObjects: { AGENT: { className: "BlockchainIqAgent", useSQLite: true } },
    durableObjectsPersist: false,
    bindings: { INVOCATION_TOKEN: token, ...source, ...vars },
    outboundService: async (request) => {
      assert.equal(request.method, "GET");
      assert.equal(request.url.startsWith(CATALOG_URL), true);
      seen.push(request.url);
      if (request.url === CATALOG_URL) return new Response(JSON.stringify(CATALOG), { status: 200, headers: { "Content-Type": "application/json" } }) as never;
      if (request.url === `${CATALOG_URL}/sample`) return new Response(envelope({ sample: true }), { status: 200, headers: { "Content-Type": "application/json" } }) as never;
      if (!request.headers.has("PAYMENT-SIGNATURE")) return challenge(request.url, quote(request.url)) as never;
      signed++;
      return new Response(envelope({ paid: request.url }), { status: 200, headers: { "Content-Type": "application/json", "PAYMENT-RESPONSE": btoa(JSON.stringify({ success: true, network: NETWORK, payer, transaction: `0x${"cd".repeat(32)}` })) } }) as never;
    },
  }));
  const headers = { authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  try {
    await run({
      get: (path) => mf.dispatchFetch(`http://example.test${path}`, { headers }) as unknown as Promise<Response>,
      post: (body) => mf.dispatchFetch("http://example.test/resource", { method: "POST", headers, body: JSON.stringify(body) }) as unknown as Promise<Response>,
      seen, signed: () => signed,
    });
  } finally { await mf.dispose(); }
}
const priced: Quote = (url) => {
  const id = CATALOG.data.find((e) => `https://www.blockchainiq.co${e.path}` === url.split("?")[0])?.price ?? "$0.03";
  const atoms = usdToAtoms(id.slice(1));
  return [baseOption(atoms), solanaOption(atoms)];
};

test("two-rail quotes: the Base option is chosen and the Solana option is dropped", () => {
  const url = `${CATALOG_URL}/calendar`;
  const policy = { url, maxAtoms: "30000" };
  const selected = selectAllowedRequirement([solanaOption("30000"), baseOption("30000")], policy);
  assert.equal(selected.network, NETWORK);
  assert.equal(validatePaymentRequired({ x402Version: 2, resource: { url }, accepts: [baseOption("30000"), solanaOption("30000")] }, policy).amount, "30000");
  assert.throws(() => selectAllowedRequirement([baseOption("30000"), baseOption("30000")], policy));
  assert.throws(() => selectAllowedRequirement([solanaOption("30000")], policy));
  assert.throws(() => selectAllowedRequirement([baseOption("30001")], policy));
  assert.equal(selectAllowedRequirement([baseOption("20000")], policy).amount, "20000");
  assert.throws(() => selectAllowedRequirement([baseOption("30000")], { url: "https://example.invalid/x", maxAtoms: "30000" }));
  assert.throws(() => selectAllowedRequirement([baseOption("30000")], { url, maxAtoms: "25000001" }));
});

test("catalogue parsing keeps well-formed GET entries and builds URLs on the fixed origin only", () => {
  const resources = parseCatalog(CATALOG);
  assert.deepEqual([...resources.keys()], ["catalog", "sample", "brief", "calendar", "event-risk", "network", "analyst-pack"]);
  assert.equal(listResources(resources).some((r) => r.resource === "catalog"), false);
  assert.equal(buildUrl(resources.get("network")!, { chain: "base" }), `${CATALOG_URL}/network/base`);
  assert.equal(buildUrl(resources.get("event-risk")!, { days: 7 }), `${CATALOG_URL}/event-risk?days=7`);
  for (const params of [{}, { chain: "../x" }, { chain: "a/b" }, { chain: "base", extra: "1" }, { chain: 5 }]) assert.throws(() => buildUrl(resources.get("network")!, params));
  assert.throws(() => buildUrl(resources.get("brief")!, { url: "https://example.invalid" }));
  assert.throws(() => parseCatalog({ source: "Someone else", terms: "https://www.blockchainiq.co/terms", data: CATALOG.data }));
});

test("limits: defaults, owner values, and refusal of malformed or over-ceiling values", () => {
  assert.deepEqual(readLimits({}), { perCall: "50000", payments: 1, total: "50000" });
  assert.deepEqual(readLimits({ MAX_PRICE_PER_CALL_USD: "0.50", MAX_PAYMENTS: "4" }), { perCall: "500000", payments: 4, total: "2000000" });
  assert.deepEqual(readLimits({ MAX_PRICE_PER_CALL_USD: "2.00", MAX_PAYMENTS: "10", MAX_TOTAL_USD: "5" }), { perCall: "2000000", payments: 10, total: "5000000" });
  for (const bad of [{ MAX_PRICE_PER_CALL_USD: "25.01" }, { MAX_PRICE_PER_CALL_USD: "-1" }, { MAX_PRICE_PER_CALL_USD: "1e3" }, { MAX_PAYMENTS: "0" }, { MAX_PAYMENTS: "1.5" }, { MAX_PAYMENTS: "10001" }, { MAX_TOTAL_USD: "lots" }]) assert.throws(() => readLimits(bad));
});

test("GET /catalog lists the resources and a free resource is read without signing or using the ledger", async () => {
  await withWorker({}, priced, async (ctx) => {
    const list = await (await ctx.get("/catalog")).json() as { resources: { resource: string; price: string }[] };
    assert.equal(list.resources.length, 6);
    assert.equal(list.resources.find((r) => r.resource === "analyst-pack")?.price, "$2.00");
    const response = await ctx.post({ resource: "sample" });
    assert.equal(response.status, 200);
    const body = await response.json() as { price: string; result: { data: { sample: boolean } } };
    assert.equal(body.price, "free");
    assert.equal(body.result.data.sample, true);
    assert.equal(ctx.signed(), 0);
    const ledger = await (await ctx.get("/ledger")).json() as { paymentsUsed: number; reservedUsd: string };
    assert.equal(ledger.paymentsUsed, 0);
    assert.equal(ledger.reservedUsd, "0.00");
  });
});

test("a paid resource is bought once from a two-rail quote; the default single payment is then used up", async () => {
  await withWorker({}, priced, async (ctx) => {
    const response = await ctx.post({ resource: "network", params: { chain: "base" }, confirmPayment: true });
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const body = await response.json() as { resource: string; price: string; evidence: { status: string; transaction: string }; result: { data: { paid: string } } };
    assert.equal(body.price, "$0.03");
    assert.equal(body.evidence.status, "provider-reported");
    assert.match(body.evidence.transaction, /^0x[0-9a-f]{64}$/);
    assert.equal(body.result.data.paid, `${CATALOG_URL}/network/base`);
    assert.equal(ctx.signed(), 1);
    const before = ctx.seen.length;
    const second = await ctx.post({ resource: "brief", confirmPayment: true });
    assert.equal(second.status, 409);
    assert.deepEqual(ctx.seen.slice(before), [CATALOG_URL]);
    assert.equal(ctx.signed(), 1);
    const ledger = await (await ctx.get("/ledger")).json() as { paymentsUsed: number; paymentsRemaining: number; reservedUsd: string; payments: { status: string; resource: string; authorization: { value: string; to: string } }[] };
    assert.equal(ledger.paymentsUsed, 1);
    assert.equal(ledger.paymentsRemaining, 0);
    assert.equal(ledger.reservedUsd, "0.03");
    assert.equal(ledger.payments.length, 1);
    assert.equal(ledger.payments[0].status, "provider-reported");
    assert.equal(ledger.payments[0].authorization.value, "30000");
    assert.equal(ledger.payments[0].authorization.to, RECIPIENT);
  });
});

test("a price above the per-call limit is refused before any request to the resource", async () => {
  await withWorker({}, priced, async (ctx) => {
    const response = await ctx.post({ resource: "analyst-pack", confirmPayment: true });
    assert.equal(response.status, 403);
    assert.deepEqual(ctx.seen, [CATALOG_URL]);
    assert.equal(ctx.signed(), 0);
    assert.equal((await (await ctx.get("/ledger")).json() as { paymentsUsed: number }).paymentsUsed, 0);
  });
});

test("owner limits: a raised per-call limit buys the 2.00 resource; the total limit stops the next payment", async () => {
  await withWorker({ MAX_PRICE_PER_CALL_USD: "2.00", MAX_PAYMENTS: "5", MAX_TOTAL_USD: "2.04" }, priced, async (ctx) => {
    assert.equal((await ctx.post({ resource: "analyst-pack", confirmPayment: true })).status, 200);
    assert.equal((await ctx.post({ resource: "calendar", confirmPayment: true })).status, 200);
    const third = await ctx.post({ resource: "calendar", confirmPayment: true });
    assert.equal(third.status, 409);
    assert.equal(ctx.signed(), 2);
    const ledger = await (await ctx.get("/ledger")).json() as { reservedUsd: string; paymentsUsed: number; limits: { maxTotalUsd: string } };
    assert.equal(ledger.reservedUsd, "2.03");
    assert.equal(ledger.paymentsUsed, 2);
    assert.equal(ledger.limits.maxTotalUsd, "2.04");
  });
});

test("a server quote above the catalogue price is never signed, and the reservation is kept", async () => {
  await withWorker({ MAX_PAYMENTS: "2" }, () => [baseOption("50000"), solanaOption("50000")], async (ctx) => {
    const response = await ctx.post({ resource: "brief", confirmPayment: true });
    assert.equal(response.status, 502);
    assert.equal(ctx.signed(), 0);
    const ledger = await (await ctx.get("/ledger")).json() as { paymentsUsed: number; payments: { status: string; authorization?: unknown }[] };
    assert.equal(ledger.paymentsUsed, 1);
    assert.equal(ledger.payments[0].status, "pending");
    assert.equal(ledger.payments[0].authorization, undefined);
  });
});

test("a quote with a changed payee, a second Base option, or no Base option is never signed", async () => {
  for (const accepts of [[{ ...baseOption("10000"), payTo: "0x0000000000000000000000000000000000000001" }], [baseOption("10000"), baseOption("10000")], [solanaOption("10000")]]) {
    await withWorker({}, () => accepts, async (ctx) => {
      assert.equal((await ctx.post({ resource: "brief", confirmPayment: true })).status, 502);
      assert.equal(ctx.signed(), 0);
    });
  }
});

test("bad requests are refused with no payment: unknown id, bad parameters, no confirmation, body naming a URL", async () => {
  await withWorker({}, priced, async (ctx) => {
    assert.equal((await ctx.post({ resource: "no-such-thing", confirmPayment: true })).status, 404);
    assert.equal((await ctx.post({ resource: "catalog" })).status, 404);
    assert.equal((await ctx.post({ resource: "poster", confirmPayment: true })).status, 404);
    assert.equal((await ctx.post({ resource: "network", confirmPayment: true })).status, 400);
    assert.equal((await ctx.post({ resource: "network", params: { chain: "../brief" }, confirmPayment: true })).status, 400);
    assert.equal((await ctx.post({ resource: "brief", params: { url: "https://example.invalid" }, confirmPayment: true })).status, 400);
    assert.equal((await ctx.post({ resource: "brief" })).status, 400);
    assert.equal((await ctx.post({ resource: "https://example.invalid/x", confirmPayment: true })).status, 400);
    assert.equal((await ctx.post({ confirmPayment: true })).status, 400);
    assert.equal(ctx.signed(), 0);
    assert.equal(ctx.seen.every((url) => url === CATALOG_URL), true);
    assert.equal((await (await ctx.get("/ledger")).json() as { paymentsUsed: number }).paymentsUsed, 0);
  });
});

test("misconfiguration fails closed: malformed limits, or a protected authorization instead of a key", async () => {
  await withWorker({ MAX_PRICE_PER_CALL_USD: "99" }, priced, async (ctx) => {
    assert.equal((await ctx.post({ resource: "brief", confirmPayment: true })).status, 503);
    assert.equal(ctx.seen.length, 0);
  });
  await withWorker({}, priced, async (ctx) => {
    assert.equal((await ctx.post({ resource: "brief", confirmPayment: true })).status, 503);
    assert.equal(ctx.signed(), 0);
    assert.equal((await (await ctx.get("/ledger")).json() as { paymentsUsed: number }).paymentsUsed, 0);
  }, { protectedSource: true });
});
