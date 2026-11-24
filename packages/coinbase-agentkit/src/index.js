import { ActionProvider } from "@coinbase/agentkit";
import { z } from "zod";
import { createPayFetch, callBlockchainIQ, callResource, listResources, loadCatalog, DEFAULT_MAX_PER_CALL } from "./core.js";
export * from "./core.js";

export const ListSchema = z.object({}).describe("No input; returns the list of Blockchain IQ resources with prices");
export const ResourceSchema = z.object({
  resource: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).describe("Resource id from list_resources, e.g. brief, event-risk, research, analyst-pack"),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
    .describe("The resource's parameters by name, e.g. { coin: \"bitcoin\" } for research or { days: 30 } for event-risk"),
}).strict();

export const BriefSchema = z.object({}).describe("No input; returns the Blockchain IQ market brief");
export const EventRiskSchema = z.object({
  days: z.number().int().min(1).max(30).optional().describe("Days ahead to cover (default 7)"),
});

/** Adapt an AgentKit EvmWalletProvider to the x402 client signer interface. */
export function walletProviderToSigner(walletProvider) {
  return {
    address: walletProvider.getAddress(),
    signTypedData: (td) => walletProvider.signTypedData(td),
  };
}

/**
 * AgentKit action provider for Blockchain IQ's x402 crypto data API.
 * Pays in USDC on Base from the agent's EvmWalletProvider (gasless EIP-3009 authorization).
 */
export class BlockchainIQActionProvider extends ActionProvider {
  /**
   * maxPerCall: most one call may cost, in USD (default 0.05). Raise it on purpose to buy dollar-priced resources.
   * maxTotal: optional, most the get_resource action may spend over the provider's life, in USD.
   */
  constructor({ maxPerCall = DEFAULT_MAX_PER_CALL, maxTotal = null, fetchImpl, onSettlement } = {}) {
    super("blockchainiq", []);
    if (!(Number(maxPerCall) > 0) || Number(maxPerCall) > 25 || (maxTotal != null && !(Number(maxTotal) > 0))) {
      throw new Error("maxPerCall must be above 0 and at most 25 (USD); maxTotal, when set, must be above 0");
    }
    this.budget = { maxTotal: maxTotal == null ? null : Number(maxTotal), spent: 0 };
    this.maxPerCall = maxPerCall;
    this.fetchImpl = fetchImpl;
    this.onSettlement = onSettlement;
  }

  supportsNetwork(network) {
    return network?.protocolFamily === "evm" && (network.networkId === "base-mainnet" || network.chainId === "8453");
  }

  getActions(walletProvider) {
    const pf = createPayFetch(walletProviderToSigner(walletProvider), {
      maxPerCall: this.maxPerCall,
      ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
    });
    const run = async (resource, opts) => {
      try {
        const { data, settlement } = await callBlockchainIQ(pf, resource, opts);
        if (settlement && this.onSettlement) this.onSettlement(settlement);
        return JSON.stringify({ data, settlement });
      } catch (e) {
        return `Error calling Blockchain IQ ${resource}: ${e.message}`;
      }
    };
    // Added by Blockchain IQ: the whole catalogue through two more actions. The catalogue is read once per provider.
    const plainFetch = this.fetchImpl ?? fetch;
    const catalog = () => (this.catalogPromise ??= loadCatalog(plainFetch).catch((e) => { this.catalogPromise = undefined; throw e; }));
    const runResource = async (resource, params) => {
      try {
        const { data, settlement, price } = await callResource(pf, await catalog(), resource, params ?? {},
          { maxPerCall: this.maxPerCall, budget: this.budget, fetchImpl: plainFetch });
        if (settlement && this.onSettlement) this.onSettlement(settlement);
        return JSON.stringify({ resource, price, data, settlement });
      } catch (e) {
        return `Error calling Blockchain IQ ${resource}: ${e.message}`;
      }
    };
    const limit = `at most $${Number(this.maxPerCall).toFixed(2)} per call${this.budget.maxTotal != null ? ` and $${Number(this.budget.maxTotal).toFixed(2)} in total` : ""}`;
    const added = [
      {
        name: "BlockchainIQActionProvider_list_resources",
        description: "List every Blockchain IQ data resource available over x402 with its id, price in USDC, what it returns and its parameters. Free; signs nothing.",
        schema: ListSchema,
        invoke: async () => {
          try { return JSON.stringify(listResources(await catalog())); }
          catch (e) { return `Error calling Blockchain IQ catalogue: ${e.message}`; }
        },
      },
      {
        name: "BlockchainIQActionProvider_get_resource",
        description: `Buy one Blockchain IQ resource by the id shown in list_resources (USDC on Base via x402, ${limit}). A resource priced above the per-call limit is refused before anything is signed.`,
        schema: ResourceSchema,
        invoke: (args) => runResource(args?.resource, args?.params),
      },
    ];
    return [
      {
        name: "BlockchainIQActionProvider_get_market_brief",
        description: "Buy Blockchain IQ's crypto market brief ($0.01 USDC on Base via x402): BTC/ETH/SOL/XRP prices and moves, events in the next 48h, short risk flags.",
        schema: BriefSchema,
        invoke: () => run("brief"),
      },
      {
        name: "BlockchainIQActionProvider_get_event_risk",
        description: "Buy Blockchain IQ's event-risk calendar ($0.05 USDC on Base via x402): US data releases, central bank decisions, Treasury auctions, crypto/regulatory milestones, with official sources.",
        schema: EventRiskSchema,
        invoke: (args) => run("event-risk", { days: args?.days }),
      },
      ...added,
    ];
  }
}

export const blockchainIQActionProvider = (opts) => new BlockchainIQActionProvider(opts);
