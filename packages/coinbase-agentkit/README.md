# Blockchain IQ x402 Integration Kit: Coinbase AgentKit

A [Coinbase AgentKit](https://github.com/coinbase/agentkit) action provider for the Blockchain IQ pay-per-call crypto data API. No account or API key. Each call is paid in USDC on Base with [x402](https://x402.org), signed by the agent's own wallet provider (gasless EIP-3009 authorization).

Credit: written by Astra Trading Co for Blockchain IQ's x402 build bounty (MIT). See NOTICE.md.

## What it does

| action | endpoint | price |
|---|---|---|
| `BlockchainIQActionProvider_get_market_brief` | `https://www.blockchainiq.co/api/x402/v1/brief` | $0.01 USDC on Base |
| `BlockchainIQActionProvider_get_event_risk` (optional `days`, 1 to 30) | `https://www.blockchainiq.co/api/x402/v1/event-risk` | $0.05 USDC on Base |

Confirmed from `src/core.js`: base URL `https://www.blockchainiq.co/api/x402/v1`, brief price 0.01, event-risk price 0.05 (these are constants in the code; the live price is whatever the server's 402 challenge says, which this kit did not query). Only Base mainnet (`eip155:8453`) `exact` payments are registered, and any payment above `maxPerCall` (default $0.05) is refused before anything is signed.

## Install

Requires Node 20 or newer. In this folder:

```bash
npm ci --ignore-scripts
```

## Run one call (spends real money)

Set your own wallet key in your shell. The kit never stores or prints it. Use a dedicated wallet holding only a small amount of USDC on Base (a call costs $0.01).

PowerShell:
```powershell
$env:AGENT_PRIVATE_KEY = Read-Host "key"   # then:
npm run example
```
bash:
```bash
read -rs AGENT_PRIVATE_KEY && export AGENT_PRIVATE_KEY && npm run example
```

`npm run example` makes one paid call to the brief endpoint (capped at $0.01) and prints the data and the settlement transaction hash.

## Use in your own agent

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
```

Each action returns a JSON string `{ data, settlement }`, or a string starting with `Error` on failure.

## Tests

`npm test` runs offline against a mocked x402 server and a stub signer (no key, no network). Results: TESTS.md.

## Known limitation

The provider overrides `getActions` and returns plain action objects instead of using AgentKit's `@CreateAction` decorator (verified by reading `src/index.js`; still true). Whether AgentKit lists these actions was not verified (the offline tests call the provider directly, not through AgentKit); Coinbase maintainers may ask for the decorator form if this is proposed upstream. AgentKit's start-up analytics request can raise an unhandled rejection; the example ignores that one error only.

## As is, and maintenance

This code is provided as is, without warranty, under the MIT license. Blockchain IQ has reviewed it statically and ran its tests offline; it has not been audited. It is not investment advice; the data is market information only. Blockchain IQ maintains this kit on a best-effort basis; issues and changes may be slow or not happen.
