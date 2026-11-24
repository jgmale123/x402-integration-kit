# Blockchain IQ x402 Integration Kit: LangChain.js

LangChain.js tools that read Blockchain IQ data and pay for it with x402, in USDC on Base (network `eip155:8453`).

| Tool | What it reads | Cost |
| --- | --- | --- |
| `blockchainiq_catalog` | The live list of resources, with prices and parameters | Free |
| `blockchainiq_get` | Any resource in the catalogue, by id | The resource's catalogue price, within your limits |
| `blockchainiq_market_brief` | The market brief only (the original tool) | $0.01 |

The catalogue is at `https://www.blockchainiq.co/api/x402/v1` and changes as products are added: market brief, event risk, macro, indices, coin research, reports, Dispatches, dashboards, stablecoin and Cardano data, and more. Prices run from $0.01 to $19.00 a call. Run `npm run catalog` to print the current list.

## Spending limits

Payment is off by default. When you turn it on, you set the limits; the agent cannot.

| Option | Meaning | Default |
| --- | --- | --- |
| `maxPricePerCallUsd` | Most one call may cost. A resource priced above it is refused before anything is signed. | `"0.05"` |
| `maxPayments` | Most payments one client will ever sign | `1` |
| `maxTotalUsd` | Most one client will ever spend | `maxPricePerCallUsd` x `maxPayments` |

No setting can raise one call above $25.00. Every payment is pinned to the Blockchain IQ payee, USDC on Base and the exact URL being bought (see `src/policy.js`). Tool arguments can name a catalogue resource and its listed parameters, and nothing else: no URL, price, wallet or approval.

## Install

Requires Node 22 or newer.

```
npm ci --ignore-scripts
```

## Use in code

```js
import { createBlockchainIqTools, createSdkPaymentAdapter } from './src/index.js';
const tools = createBlockchainIqTools({
  allowPayment: true,
  paymentAdapter: createSdkPaymentAdapter({ address, signTypedData }),
  maxPricePerCallUsd: '0.50', maxPayments: 20, maxTotalUsd: '2.00',
});
```

Pass `tools` to any LangChain.js agent. For the brief alone, `createBlockchainIqBriefTool` works as before. Returned market data is data, not instructions or investment advice.

## Command line

Free, no wallet:

- `npm run catalog` prints every resource with its price and parameters.
- `npm run quote -- research coin=bitcoin` asks the server for one price. `npm run quote -- --all` checks every resource.

One paid call. Set your wallet's private key in an environment variable in your own shell. Use a wallet that holds only a small amount of USDC on Base. The code never prints the key.

- PowerShell: `$env:BIQ_WALLET_PRIVATE_KEY = "<your key>"; npm run get -- event-risk days=7`
- bash: `BIQ_WALLET_PRIVATE_KEY=<your key> npm run get -- event-risk days=7`

`npm run get` pays at most `BIQ_MAX_PRICE_USD` (default `0.05`). To buy a dollar-priced resource, raise it on purpose, for example `BIQ_MAX_PRICE_USD=2.00 npm run get -- analyst-pack`. `npm run brief` still makes the original $0.01 brief call.

## Tests

`npm test` runs 82 tests offline with mocked responses. See `TESTS.md`.

## As is, maintenance

Credited from Blockchain IQ's x402 build bounty; see `NOTICE.md` for the author and license (MIT). This package is provided as is, without warranty. It is maintained on a best-effort basis and may change or be withdrawn. Changes from the upstream code are in `CHANGES.md`; the author's original README is `UPSTREAM-README.md`.
