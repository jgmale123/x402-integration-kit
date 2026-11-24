import { Agent, getAgentByName } from "agents";
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { CATALOG_URL, RESOURCE_URL, validateInvocation } from "./policy.ts";
import { atomsToUsd, readLimits } from "./limits.ts";
import type { ResourcePolicy } from "./policy.ts";
import { eventRiskClient, protectedEventRiskClient, resourceClient } from "./payment.ts";
import { settlementEvidence } from "./settlement.ts";
import { buildUrl, listResources, parseCatalog } from "./catalog.ts";
import type { CatalogResource } from "./catalog.ts";

export interface Env {
  AGENT: DurableObjectNamespace<BlockchainIqAgent>;
  INVOCATION_TOKEN: string;
  PROJECT_EVM_PRIVATE_KEY?: string;
  PROJECT_PAYMENT_AUTHORIZATION?: string;
  PROJECT_OPERATION_ID?: string;
  PROJECT_INTENT_HASH?: string;
  PROJECT_PAYER_ADDRESS?: string;
  PROJECT_CHAIN_CLOCK_OFFSET_SECONDS?: string;
  /** Added by Blockchain IQ: owner limits for POST /resource. Dollar amounts as plain text, for example "0.05". */
  MAX_PRICE_PER_CALL_USD?: string;
  MAX_PAYMENTS?: string;
  MAX_TOTAL_USD?: string;
}
const OPERATION_KEY = "blockchainiq:event-risk:one-call";
// Added by Blockchain IQ: the spend ledger for POST /resource. Reservations are never refunded automatically.
const LEDGER_KEY = "blockchainiq:resource:ledger";
type Ledger = { reservedAtoms: string; payments: number };
const paymentKey = (n: number) => `${LEDGER_KEY}:payment:${String(n).padStart(5, "0")}`;

/** One GET to the fixed origin; redirects are refused. */
async function providerGet(url: string): Promise<Response> {
  if (!url.startsWith(CATALOG_URL)) throw Error("Only the Blockchain IQ x402 API is enabled");
  const response = await fetch(new Request(url, { method: "GET", redirect: "manual", headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) }));
  if (response.status >= 300 && response.status < 400) throw Error("Provider redirects are refused");
  return response;
}
async function readCatalog(): Promise<Map<string, CatalogResource>> {
  const response = await providerGet(CATALOG_URL);
  if (response.status !== 200) throw Error("Catalogue request failed");
  return parseCatalog(await response.json());
}
const isEnvelope = (v: unknown) => !!v && typeof v === "object" && (v as Record<string, unknown>).source === "Blockchain IQ" && (v as Record<string, unknown>).terms === "https://www.blockchainiq.co/terms";

export class BlockchainIqAgent extends Agent<Env> {
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (!this.env.INVOCATION_TOKEN || this.env.INVOCATION_TOKEN.length < 32) return Response.json({ error: "Invocation authentication is not configured" }, { status: 503 });
    if (request.headers.get("authorization") !== `Bearer ${this.env.INVOCATION_TOKEN}`) return new Response("Unauthorized", { status: 401 });
    if (request.method === "GET" && ["/health", "/receipt"].includes(url.pathname)) {
      const state = await this.ctx.storage.get(OPERATION_KEY);
      return Response.json({ ok: true, integration: "blockchainiq-cloudflare-event-risk", operation: state ?? { status: "unused" } });
    }
    if (request.method === "GET" && url.pathname === "/catalog") return this.catalog();
    if (request.method === "GET" && url.pathname === "/ledger") return this.ledger();
    if (request.method === "POST" && url.pathname === "/resource") return this.resource(request);
    if (request.method !== "POST" || url.pathname !== "/event-risk") return new Response("Not found", { status: 404 });
    const body = await request.json().catch(() => null) as { confirmPayment?: unknown } | null;
    if (body?.confirmPayment !== true) return Response.json({ error: "Explicit confirmPayment=true is required" }, { status: 400 });

    let client, payer: string;
    try {
      const offset = this.env.PROJECT_CHAIN_CLOCK_OFFSET_SECONDS === undefined ? 0 : Number(this.env.PROJECT_CHAIN_CLOCK_OFFSET_SECONDS);
      if (!Number.isInteger(offset) || Math.abs(offset) > 300) throw Error();
      const clock = () => Math.floor(Date.now() / 1000) + offset;
      if (!!this.env.PROJECT_EVM_PRIVATE_KEY === !!this.env.PROJECT_PAYMENT_AUTHORIZATION) throw Error();
      if (this.env.PROJECT_PAYMENT_AUTHORIZATION) {
        if (!this.env.PROJECT_OPERATION_ID || !this.env.PROJECT_INTENT_HASH || !/^0x[0-9a-fA-F]{40}$/.test(this.env.PROJECT_PAYER_ADDRESS ?? "")) throw Error();
        payer = this.env.PROJECT_PAYER_ADDRESS!;
        client = protectedEventRiskClient(JSON.parse(this.env.PROJECT_PAYMENT_AUTHORIZATION), { id: this.env.PROJECT_OPERATION_ID, hash: this.env.PROJECT_INTENT_HASH, payer }, clock);
      } else {
        const account = privateKeyToAccount(this.env.PROJECT_EVM_PRIVATE_KEY as `0x${string}`);
        payer = account.address;
        client = eventRiskClient(account, clock);
      }
    } catch { return Response.json({ error: "Configure exactly one supported project payment source" }, { status: 503 }); }

    const reservedAt = Date.now();
    const operation = { reservedAt, payer, operationId: this.env.PROJECT_OPERATION_ID ?? OPERATION_KEY, intentHash: this.env.PROJECT_INTENT_HASH ?? null, resource: RESOURCE_URL };
    const reserved = await this.ctx.storage.transaction(async (tx) => {
      if (await tx.get(OPERATION_KEY)) return false;
      await tx.put(OPERATION_KEY, { ...operation, status: "pending" });
      return true;
    });
    if (!reserved) return Response.json({ error: "The one-call operation is already reserved; reconcile it before any retry" }, { status: 409 });

    let paymentAttempted = false;
    client.onAfterPaymentCreation(async ({ paymentPayload }) => {
      paymentAttempted = true;
      const payload = paymentPayload.payload as { authorization?: unknown };
      await this.ctx.storage.put(OPERATION_KEY, { ...operation, status: "authorized", authorization: payload.authorization });
    });
    let transportCalls = 0;
    const transport: typeof fetch = async (input, init) => {
      const outgoing = new Request(input, { ...init, redirect: "manual" });
      validateInvocation(new URL(outgoing.url), outgoing.method);
      if (++transportCalls > 2) throw Error("Only the unpaid challenge and one paid dispatch are permitted");
      const response = await fetch(outgoing);
      if (response.status >= 300 && response.status < 400) throw Error("Provider redirects are refused");
      return response;
    };
    try {
      const response = await wrapFetchWithPayment(transport, client)(RESOURCE_URL, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(15000) });
      const paymentResponse = response.headers.get("PAYMENT-RESPONSE");
      const evidence = settlementEvidence(paymentResponse, payer, paymentAttempted);
      const previous = await this.ctx.storage.get<Record<string, unknown>>(OPERATION_KEY);
      await this.ctx.storage.put(OPERATION_KEY, { ...previous, ...evidence, httpStatus: response.status, paymentResponse: paymentResponse?.slice(0, 8192) ?? null, completedAt: Date.now() });
      if (!response.ok || evidence.status !== "provider-reported") return Response.json({ error: "The paid result needs reconciliation; use the retained receipt before considering any further action", httpStatus: response.status, evidence }, { status: 502 });
      return Response.json({ httpStatus: response.status, evidence, paymentResponse, result: await response.json() });
    } catch {
      return Response.json({ error: "The original operation is retained; reconcile its nonce and receipt before any retry" }, { status: 502 });
    }
  }

  // Added by Blockchain IQ (see CHANGES.md): any resource in the live catalogue, within the owner's limits.

  /** Free. The list of resources with prices and parameters. */
  async catalog(): Promise<Response> {
    try { return Response.json({ resources: listResources(await readCatalog()) }); }
    catch { return Response.json({ error: "The Blockchain IQ catalogue could not be read" }, { status: 502 }); }
  }

  /** The limits, what is reserved against them, and the retained record of every payment attempt. */
  async ledger(): Promise<Response> {
    let limits;
    try { limits = readLimits(this.env); } catch { return Response.json({ error: "Spending limits are misconfigured" }, { status: 503 }); }
    const ledger = await this.ctx.storage.get<Ledger>(LEDGER_KEY) ?? { reservedAtoms: "0", payments: 0 };
    const payments = [...(await this.ctx.storage.list({ prefix: `${LEDGER_KEY}:payment:`, reverse: true, limit: 100 })).values()];
    return Response.json({
      limits: { maxPricePerCallUsd: atomsToUsd(limits.perCall), maxPayments: limits.payments, maxTotalUsd: atomsToUsd(limits.total) },
      reservedUsd: atomsToUsd(ledger.reservedAtoms), paymentsUsed: ledger.payments, paymentsRemaining: Math.max(0, limits.payments - ledger.payments), payments,
    });
  }

  /**
   * POST /resource with body { resource, params?, confirmPayment? }. The body can only name a catalogue resource and
   * its listed parameters. A free resource is fetched as is. A paid one needs confirmPayment=true, a catalogue price
   * at or under MAX_PRICE_PER_CALL_USD, and room in the ledger; the wallet never signs more than the catalogue price.
   */
  async resource(request: Request): Promise<Response> {
    const body = await request.json().catch(() => null) as { confirmPayment?: unknown; resource?: unknown; params?: unknown } | null;
    if (!body || typeof body.resource !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(body.resource)) return Response.json({ error: "Body must name a catalogue resource id" }, { status: 400 });
    let limits;
    try { limits = readLimits(this.env); } catch { return Response.json({ error: "Spending limits are misconfigured" }, { status: 503 }); }

    let entry: CatalogResource | undefined;
    try { entry = (await readCatalog()).get(body.resource); }
    catch { return Response.json({ error: "The Blockchain IQ catalogue could not be read" }, { status: 502 }); }
    if (!entry || entry.id === "catalog") return Response.json({ error: "Unknown resource; GET /catalog lists the ids" }, { status: 404 });
    let target: string;
    try { target = buildUrl(entry, body.params ?? {}); }
    catch { return Response.json({ error: "Parameters do not match the catalogue entry", requiredParams: entry.pathParams, optionalParams: entry.queryParams }, { status: 400 }); }

    if (entry.priceAtoms === "0") {
      try {
        const response = await providerGet(target);
        const result = response.status === 200 ? await response.json() : null;
        if (!isEnvelope(result)) throw Error();
        return Response.json({ httpStatus: 200, resource: entry.id, price: "free", evidence: { status: "unpaid-response" }, result });
      } catch { return Response.json({ error: "The free resource could not be read" }, { status: 502 }); }
    }

    if (body.confirmPayment !== true) return Response.json({ error: "Explicit confirmPayment=true is required", resource: entry.id, price: entry.price }, { status: 400 });
    if (BigInt(entry.priceAtoms) > BigInt(limits.perCall)) return Response.json({ error: "The price is above the owner's per-call limit; nothing was requested or signed", resource: entry.id, price: entry.price, maxPricePerCallUsd: atomsToUsd(limits.perCall) }, { status: 403 });

    let client, payer: string;
    const policy: ResourcePolicy = { url: target, maxAtoms: entry.priceAtoms };
    try {
      const offset = this.env.PROJECT_CHAIN_CLOCK_OFFSET_SECONDS === undefined ? 0 : Number(this.env.PROJECT_CHAIN_CLOCK_OFFSET_SECONDS);
      if (!Number.isInteger(offset) || Math.abs(offset) > 300) throw Error();
      // A protected authorization is bound to the event-risk call, so this route takes the private-key source only.
      if (!this.env.PROJECT_EVM_PRIVATE_KEY || this.env.PROJECT_PAYMENT_AUTHORIZATION) throw Error();
      const account = privateKeyToAccount(this.env.PROJECT_EVM_PRIVATE_KEY as `0x${string}`);
      payer = account.address;
      client = resourceClient(account, policy, () => Math.floor(Date.now() / 1000) + offset);
    } catch { return Response.json({ error: "POST /resource needs PROJECT_EVM_PRIVATE_KEY and no protected authorization" }, { status: 503 }); }

    const record = { reservedAt: Date.now(), payer, resource: entry.id, url: target, reservedAtoms: entry.priceAtoms };
    const slot = await this.ctx.storage.transaction(async (tx) => {
      const ledger = await tx.get<Ledger>(LEDGER_KEY) ?? { reservedAtoms: "0", payments: 0 };
      const next = BigInt(ledger.reservedAtoms) + BigInt(entry.priceAtoms);
      if (ledger.payments >= limits.payments || next > BigInt(limits.total)) return 0;
      await tx.put(LEDGER_KEY, { reservedAtoms: next.toString(), payments: ledger.payments + 1 });
      await tx.put(paymentKey(ledger.payments + 1), { ...record, status: "pending" });
      return ledger.payments + 1;
    });
    if (!slot) return Response.json({ error: "The owner's spending limits are used up; nothing was requested or signed" }, { status: 409 });
    const key = paymentKey(slot);

    let paymentAttempted = false;
    client.onAfterPaymentCreation(async ({ paymentPayload }) => {
      paymentAttempted = true;
      const payload = paymentPayload.payload as { authorization?: unknown };
      await this.ctx.storage.put(key, { ...record, status: "authorized", authorization: payload.authorization });
    });
    let transportCalls = 0;
    const transport: typeof fetch = async (input, init) => {
      const outgoing = new Request(input, { ...init, redirect: "manual" });
      validateInvocation(new URL(outgoing.url), outgoing.method, policy);
      if (++transportCalls > 2) throw Error("Only the unpaid challenge and one paid dispatch are permitted");
      const response = await fetch(outgoing);
      if (response.status >= 300 && response.status < 400) throw Error("Provider redirects are refused");
      return response;
    };
    try {
      const response = await wrapFetchWithPayment(transport, client)(target, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(15000) });
      const paymentResponse = response.headers.get("PAYMENT-RESPONSE");
      const evidence = settlementEvidence(paymentResponse, payer, paymentAttempted);
      const previous = await this.ctx.storage.get<Record<string, unknown>>(key);
      await this.ctx.storage.put(key, { ...previous, ...evidence, httpStatus: response.status, paymentResponse: paymentResponse?.slice(0, 8192) ?? null, completedAt: Date.now() });
      if (!response.ok || evidence.status !== "provider-reported") return Response.json({ error: "The paid result needs reconciliation; the reservation stays in the ledger", httpStatus: response.status, evidence }, { status: 502 });
      return Response.json({ httpStatus: response.status, resource: entry.id, price: entry.price, evidence, paymentResponse, result: await response.json() });
    } catch {
      return Response.json({ error: "The attempt is retained in the ledger; reconcile its nonce and receipt before any retry" }, { status: 502 });
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!new Set(["/health", "/event-risk", "/receipt", "/catalog", "/resource", "/ledger"]).has(url.pathname) || url.search) return new Response("Not found", { status: 404 });
    const singleton = await getAgentByName(env.AGENT, "blockchainiq-event-risk-one-call");
    return singleton.fetch(new Request(`https://agent.internal${url.pathname}`, request));
  },
};
