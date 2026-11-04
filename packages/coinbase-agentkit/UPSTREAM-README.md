# blockchainiq-x402-agentkit

A [Coinbase AgentKit](https://github.com/coinbase/agentkit) action provider for [Blockchain IQ](https://www.blockchainiq.co/agents)'s pay-per-call crypto data API. No account or API key: each request is paid in USDC on Base with [x402](https://x402.org), signed by the agent's own `EvmWalletProvider` (gasless EIP-3009 authorization).

## Actions

| action | price | returns |
|---|---|---|
| `BlockchainIQActionProvider_get_market_brief` | $0.01 | BTC/ETH/SOL/XRP prices and moves, events in the next 48h, risk flags |
| `BlockchainIQActionProvider_get_event_risk` (`days?`) | $0.05 | US macro releases, central bank decisions, Treasury auctions, crypto/regulatory milestones |

Supports Base mainnet only (`supportsNetwork`). Prices: https://www.blockchainiq.co/api/x402/v1.

## Install

```bash
git clone https://github.com/astratc/blockchainiq-x402-agentkit && cd blockchainiq-x402-agentkit
npm install
```

## Use

```js
import { AgentKit, ViemWalletProvider } from "@coinbase/agentkit";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { blockchainIQActionProvider } from "./src/index.js";

const walletProvider = new ViemWalletProvider(createWalletClient({
  account: privateKeyToAccount(process.env.AGENT_PRIVATE_KEY), chain: base, transport: http(),
}));
const agentkit = await AgentKit.from({
  walletProvider,
  actionProviders: [blockchainIQActionProvider({ maxPerCall: 0.05 })],
});
// Works with any AgentKit framework extension, e.g. getLangChainTools(agentkit) or getVercelAITools(agentkit).
```

Each action returns JSON `{ data, settlement }`; `settlement.transaction` is the Base settlement tx hash.

## Safety

- Per-call spend cap (default $0.05) enforced by the x402 client before signing; tests verify an over-cap 402 is refused with zero signatures.
- Only `eip155:8453` `exact` payments are registered.

## Paid call example

```bash
AGENT_PRIVATE_KEY=0x... npm run example   # one $0.01 call to brief via AgentKit
```

Verified run (25 Oct 2026): settlement tx [`0x9834580d6002b63984a4b51ca156480953a43d26506fd771e26aa38e2a83a721`](https://basescan.org/tx/0x9834580d6002b63984a4b51ca156480953a43d26506fd771e26aa38e2a83a721).

Note: AgentKit's wallet provider fires an un-awaited analytics request at start-up; if it fails, Node exits on the unhandled rejection. The example ignores that one error only.

## Tests

`npm test` runs offline with a mock x402 server and a throwaway key.

## License

MIT. Market data only, not investment advice. Not affiliated with Blockchain IQ.
