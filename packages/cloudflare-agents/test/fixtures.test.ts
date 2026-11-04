import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { NETWORK, PRICE_ATOMS, RECIPIENT, RESOURCE_URL, USDC } from "../src/policy.ts";

// Offline fixture tests added by the Blockchain IQ x402 Integration Kit.
// All outbound HTTP is answered by a local fixture; no request leaves the machine.
// The wallet key is generated in memory for each test and is never printed.

const root = fileURLToPath(new URL("../", import.meta.url));
execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "deploy", "--dry-run", "--outdir", ".wrangler-dry-run"], { cwd: root, stdio: "pipe", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });

const goodChallenge = { x402Version: 2, resource: { url: RESOURCE_URL }, accepts: [{ scheme: "exact", network: NETWORK, amount: PRICE_ATOMS, asset: USDC, payTo: RECIPIENT, maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2" } }] };
const challengeResponse = (challenge: unknown) => new Response("{}", { status: 402, headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)), "Content-Type": "application/json" } });
const GOOD_BODY = JSON.stringify({ confirmPayment: true });

type Fixture = (request: Request, call: number, payer: string) => Response | Promise<Response>;
type Ctx = { invoke: (body?: string) => Promise<Response>; receipt: () => Promise<{ operation: Record<string, unknown> }>; calls: () => number; signed: () => boolean };

async function withWorker(fixture: Fixture, run: (ctx: Ctx) => Promise<void>) {
  const key = generatePrivateKey();
  const payer = privateKeyToAccount(key).address;
  const token = randomBytes(32).toString("hex");
  let calls = 0, signed = false;
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, scriptPath: fileURLToPath(new URL("../.wrangler-dry-run/index.js", import.meta.url)),
    compatibilityDate: "2026-10-25", compatibilityFlags: ["nodejs_compat"],
    durableObjects: { AGENT: { className: "BlockchainIqAgent", useSQLite: true } },
    durableObjectsPersist: false,
    bindings: { INVOCATION_TOKEN: token, PROJECT_EVM_PRIVATE_KEY: key },
    outboundService: async (request) => {
      assert.equal(request.url, RESOURCE_URL);
      assert.equal(request.method, "GET");
      calls++;
      if (request.headers.has("PAYMENT-SIGNATURE")) signed = true;
      return fixture(request as unknown as Request, calls, payer) as never;
    },
  }));
  try {
    await run({
      invoke: (body = GOOD_BODY) => mf.dispatchFetch("http://example.test/event-risk", { method: "POST", headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body }) as unknown as Promise<Response>,
      receipt: async () => (await mf.dispatchFetch("http://example.test/receipt", { headers: { authorization: `Bearer ${token}` } })).json() as unknown as { operation: Record<string, unknown> },
      calls: () => calls,
      signed: () => signed,
    });
  } finally { await mf.dispose(); }
}

const paidHeaders = (payer: string) => ({ "Content-Type": "application/json", "PAYMENT-RESPONSE": btoa(JSON.stringify({ success: true, network: NETWORK, payer, transaction: `0x${"ab".repeat(32)}` })) });

test("fixture success: 402 challenge, one paid retry, JSON result and provider-reported evidence", async () => {
  await withWorker((_request, call, payer) => call === 1 ? challengeResponse(goodChallenge) : new Response(JSON.stringify({ events: [{ name: "synthetic" }] }), { status: 200, headers: paidHeaders(payer) }), async (ctx) => {
    const response = await ctx.invoke();
    assert.equal(response.status, 200);
    const body = await response.json() as { httpStatus: number; evidence: { status: string; transaction: string }; result: { events: unknown[] } };
    assert.equal(body.httpStatus, 200);
    assert.equal(body.evidence.status, "provider-reported");
    assert.match(body.evidence.transaction, /^0x[0-9a-f]{64}$/);
    assert.equal(body.result.events.length, 1);
    assert.equal(ctx.calls(), 2);
    assert.equal(ctx.signed(), true);
  });
});

test("fixture 402 challenge with changed terms is refused before anything is signed", async () => {
  const tampered = { ...goodChallenge, accepts: [{ ...goodChallenge.accepts[0], amount: "500000" }] };
  await withWorker(() => challengeResponse(tampered), async (ctx) => {
    const response = await ctx.invoke();
    assert.equal(response.status, 502);
    assert.equal(ctx.calls(), 1);
    assert.equal(ctx.signed(), false);
    const { operation } = await ctx.receipt();
    assert.equal(operation.authorization, undefined);
  });
});

test("fixture 402 with no PAYMENT-REQUIRED header is refused without signing", async () => {
  await withWorker(() => new Response("{}", { status: 402, headers: { "Content-Type": "application/json" } }), async (ctx) => {
    const response = await ctx.invoke();
    assert.equal(response.status, 502);
    assert.equal(ctx.signed(), false);
  });
});

test("fixture HTTP error after payment returns 502, retains evidence, and a retry is refused", async () => {
  await withWorker((_request, call, payer) => call === 1 ? challengeResponse(goodChallenge) : new Response(JSON.stringify({ error: "upstream failure" }), { status: 500, headers: paidHeaders(payer) }), async (ctx) => {
    const response = await ctx.invoke();
    assert.equal(response.status, 502);
    const body = await response.json() as { httpStatus: number; error: string };
    assert.equal(body.httpStatus, 500);
    assert.match(body.error, /reconciliation/);
    assert.equal((await ctx.invoke()).status, 409);
    assert.equal(ctx.calls(), 2);
  });
});

test("fixture HTTP error on the unpaid request (500, no challenge) returns 502 and signs nothing", async () => {
  await withWorker(() => new Response("server error", { status: 500 }), async (ctx) => {
    const response = await ctx.invoke();
    assert.equal(response.status, 502);
    assert.equal(ctx.signed(), false);
    assert.equal(ctx.calls(), 1);
  });
});

test("fixture malformed paid body (200 but not JSON) returns 502 and the receipt is retained", async () => {
  await withWorker((_request, call, payer) => call === 1 ? challengeResponse(goodChallenge) : new Response("<<not json>>", { status: 200, headers: paidHeaders(payer) }), async (ctx) => {
    const response = await ctx.invoke();
    assert.equal(response.status, 502);
    const { operation } = await ctx.receipt();
    assert.equal(operation.status, "provider-reported");
    assert.equal(operation.httpStatus, 200);
  });
});

test("fixture malformed PAYMENT-RESPONSE header is not accepted as a receipt", async () => {
  await withWorker((_request, call) => call === 1 ? challengeResponse(goodChallenge) : new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json", "PAYMENT-RESPONSE": "%%%not-base64%%%" } }), async (ctx) => {
    const response = await ctx.invoke();
    assert.equal(response.status, 502);
    const { operation } = await ctx.receipt();
    assert.equal(operation.status, "unverified-response");
  });
});

test("fixture malformed request body to the Worker is rejected with 400 and makes no outbound call", async () => {
  await withWorker(() => { throw Error("must not be called"); }, async (ctx) => {
    assert.equal((await ctx.invoke("not json")).status, 400);
    assert.equal((await ctx.invoke(JSON.stringify({ confirmPayment: "yes" }))).status, 400);
    assert.equal(ctx.calls(), 0);
  });
});
