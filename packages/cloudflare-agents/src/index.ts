import { Agent, getAgentByName } from "agents";
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { RESOURCE_URL, validateInvocation } from "./policy.ts";
import { eventRiskClient, protectedEventRiskClient } from "./payment.ts";
import { settlementEvidence } from "./settlement.ts";

export interface Env {
  AGENT: DurableObjectNamespace<BlockchainIqAgent>;
  INVOCATION_TOKEN: string;
  PROJECT_EVM_PRIVATE_KEY?: string;
  PROJECT_PAYMENT_AUTHORIZATION?: string;
  PROJECT_OPERATION_ID?: string;
  PROJECT_INTENT_HASH?: string;
  PROJECT_PAYER_ADDRESS?: string;
  PROJECT_CHAIN_CLOCK_OFFSET_SECONDS?: string;
}
const OPERATION_KEY = "blockchainiq:event-risk:one-call";

export class BlockchainIqAgent extends Agent<Env> {
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (!this.env.INVOCATION_TOKEN || this.env.INVOCATION_TOKEN.length < 32) return Response.json({ error: "Invocation authentication is not configured" }, { status: 503 });
    if (request.headers.get("authorization") !== `Bearer ${this.env.INVOCATION_TOKEN}`) return new Response("Unauthorized", { status: 401 });
    if (request.method === "GET" && ["/health", "/receipt"].includes(url.pathname)) {
      const state = await this.ctx.storage.get(OPERATION_KEY);
      return Response.json({ ok: true, integration: "blockchainiq-cloudflare-event-risk", operation: state ?? { status: "unused" } });
    }
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
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!new Set(["/health", "/event-risk", "/receipt"]).has(url.pathname) || url.search) return new Response("Not found", { status: 404 });
    const singleton = await getAgentByName(env.AGENT, "blockchainiq-event-risk-one-call");
    return singleton.fetch(new Request(`https://agent.internal${url.pathname}`, request));
  },
};
