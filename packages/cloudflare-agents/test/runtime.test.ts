import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { NETWORK, PRICE_ATOMS, RECIPIENT, RESOURCE_URL, USDC } from "../src/policy.ts";
import { AUTH_TYPES } from "../src/payment.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "deploy", "--dry-run", "--outdir", ".wrangler-dry-run"], { cwd: root, stdio: "pipe", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });

for (const scenario of ["receipt", "protected-receipt", "protected-clock-receipt", "missing-receipt", "lost-response", "redirect"]) {
  test(`local Agent runtime preserves one-call state: ${scenario}`, async () => {
    // These temporary test identities never leave the local simulated Worker.
    const key = generatePrivateKey(), account = privateKeyToAccount(key), payer = account.address;
    const token = randomBytes(32).toString("hex");
    const succeeded = ["receipt", "protected-receipt", "protected-clock-receipt"].includes(scenario);
    const protectedSource = scenario.startsWith("protected-");
    const domain = { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC } as const;
    const authorization = { from: payer, to: RECIPIENT, value: PRICE_ATOMS, validAfter: "0", validBefore: String(Math.floor(Date.now() / 1000) + 250), nonce: `0x${"56".repeat(32)}` as `0x${string}` } as const;
    const signature = await account.signTypedData({ domain, types: AUTH_TYPES, primaryType: "TransferWithAuthorization", message: { ...authorization, value: 50000n, validAfter: 0n, validBefore: BigInt(authorization.validBefore) } });
    const bindings: Record<string, string> = protectedSource ? {
      INVOCATION_TOKEN: token, PROJECT_OPERATION_ID: "synthetic-operation", PROJECT_INTENT_HASH: "synthetic-hash", PROJECT_PAYER_ADDRESS: payer,
      PROJECT_PAYMENT_AUTHORIZATION: JSON.stringify({ id: "synthetic-operation", hash: "synthetic-hash", state: "authorized", domain, types: AUTH_TYPES, authorization, signature }),
    } : { INVOCATION_TOKEN: token, PROJECT_EVM_PRIVATE_KEY: key };
    if (scenario === "protected-clock-receipt") bindings.PROJECT_CHAIN_CLOCK_OFFSET_SECONDS = "120";
    let requests = 0;
    const seen: { url: string; method: string }[] = [];
    const mf = new Miniflare(convertV4MiniflareOptions({
      modules: true, scriptPath: fileURLToPath(new URL("../.wrangler-dry-run/index.js", import.meta.url)),
      compatibilityDate: "2026-10-25", compatibilityFlags: ["nodejs_compat"],
      durableObjects: { AGENT: { className: "BlockchainIqAgent", useSQLite: true } },
      durableObjectsPersist: false,
      bindings,
      outboundService: async (request) => {
        seen.push({ url: request.url, method: request.method });
        assert.equal(request.url, RESOURCE_URL);
        assert.equal(request.method, "GET");
        requests++;
        if (scenario === "redirect") return new Response(null, { status: 302, headers: { location: "https://example.invalid/refused" } });
        if (requests === 1) {
          assert.equal(request.headers.has("PAYMENT-SIGNATURE"), false);
          const challenge = { x402Version: 2, resource: { url: RESOURCE_URL }, accepts: [{ scheme: "exact", network: NETWORK, amount: PRICE_ATOMS, asset: USDC, payTo: RECIPIENT, maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2" } }] };
          return new Response("{}", { status: 402, headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)), "Content-Type": "application/json" } });
        }
        assert.equal(request.headers.has("PAYMENT-SIGNATURE"), true);
        if (protectedSource) {
          const packet = JSON.parse(atob(request.headers.get("PAYMENT-SIGNATURE")!));
          assert.equal(packet.payload.authorization.nonce === authorization.nonce && packet.payload.signature === signature, true);
        }
        if (scenario === "lost-response") throw Error("Synthetic transport loss after paid dispatch");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (succeeded) headers["PAYMENT-RESPONSE"] = btoa(JSON.stringify({ success: true, network: NETWORK, payer, transaction: `0x${"45".repeat(32)}` }));
        return new Response(JSON.stringify({ synthetic: true }), { status: 200, headers });
      },
    }));
    try {
      const unauthorized = await mf.dispatchFetch("http://example.test/event-risk", { method: "POST", body: '{"confirmPayment":true}' });
      assert.equal(unauthorized.status, 401);
      assert.equal(requests, 0);
      const invoke = () => mf.dispatchFetch("http://example.test/event-risk", { method: "POST", headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: '{"confirmPayment":true}' });
      const attempts = await Promise.all([invoke(), invoke()]);
      assert.equal(attempts.filter((response) => response.status === 409).length, 1);
      const first = attempts.find((response) => response.status !== 409)!;
      assert.equal(first.status, succeeded ? 200 : 502, JSON.stringify({ seen, response: await first.clone().json() }));
      assert.equal((await invoke()).status, 409);
      assert.equal(requests, scenario === "redirect" ? 1 : 2, JSON.stringify(seen));
      const retained = await mf.dispatchFetch("http://example.test/receipt", { headers: { authorization: `Bearer ${token}` } });
      const body = await retained.json() as { operation: { status: string; operationId: string; authorization: { nonce: string }; paymentResponse?: string } };
      assert.equal(body.operation.operationId, protectedSource ? "synthetic-operation" : "blockchainiq:event-risk:one-call");
      if (scenario !== "redirect") assert.match(body.operation.authorization.nonce, /^0x[0-9a-fA-F]{64}$/);
      assert.notEqual(body.operation.status, "settled");
      assert.equal(body.operation.status === "provider-reported", succeeded);
    } finally { await mf.dispose(); }
  });
}
