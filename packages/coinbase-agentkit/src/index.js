import { ActionProvider } from "@coinbase/agentkit";
import { z } from "zod";
import { createPayFetch, callBlockchainIQ, DEFAULT_MAX_PER_CALL } from "./core.js";
export * from "./core.js";

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
  constructor({ maxPerCall = DEFAULT_MAX_PER_CALL, fetchImpl, onSettlement } = {}) {
    super("blockchainiq", []);
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
    ];
  }
}

export const blockchainIQActionProvider = (opts) => new BlockchainIQActionProvider(opts);
