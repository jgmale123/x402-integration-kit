# Blockchain IQ x402 plugins for ElizaOS

Part of the Blockchain IQ x402 Integration Kit. Two native ElizaOS actions that buy Blockchain IQ data through x402, in USDC on Base.

| Action | What it reads | Cost |
| --- | --- | --- |
| `BLOCKCHAINIQ_GET` | Any resource in the live catalogue, by id | The resource's catalogue price, within your limits |
| `BLOCKCHAINIQ_MARKET_BRIEF` | The market brief only (the original action) | $0.01 |

The catalogue is at `https://www.blockchainiq.co/api/x402/v1` and changes as products are added. On 11/24/2026 it listed 49 resources: 6 free and 43 paid, from $0.01 to $19.00 a call. Run `npm run catalog` to print the current list.

## Any catalogue resource (version 0.2.0)

`createBlockchainIqCatalogPlugin({ ownerEntityId, onResult, paymentAdapter, allowPayment, maxPricePerCallUsd, maxPayments, maxTotalUsd, allowedResources })` returns an ElizaOS `Plugin` with the action `BLOCKCHAINIQ_GET`. Only a message from the configured operator can trigger it; that message names the resource in `content.resource` and its parameters in `content.params`. The result goes to your private `onResult` consumer and never into the action result, callbacks, memory or logs. `allowedResources`, when set, restricts the action to the ids you list.

| Option | Meaning | Default |
| --- | --- | --- |
| `maxPricePerCallUsd` | Most one call may cost. A resource priced above it is refused before anything is signed. | `"0.05"` |
| `maxPayments` | Most payments one client will ever sign | `1` |
| `maxTotalUsd` | Most one client will ever spend | `maxPricePerCallUsd` x `maxPayments` |

No setting can raise one call above $25.00. Every payment is pinned to the Blockchain IQ payee, USDC on Base and the exact URL being bought (`src/policy.js`). The live quote carries one option per rail (Base and Solana); only the Base option is ever signed.

```sh
npm run catalog                                  # free: every resource with price and parameters
npm run get -- event-risk days=7                 # free: the server's price, nothing signed
npm run get -- event-risk days=7 --allow-payment # one paid call; key from BIQ_X402_PRIVATE_KEY
```

`npm run get` pays at most `BIQ_MAX_PRICE_USD` (default `0.05`). To buy a dollar-priced resource, raise it on purpose.

## The market brief action

- Endpoint: `https://www.blockchainiq.co/api/x402/v1/brief`
- Price: $0.01 per call, paid in USDC on Base (eip155:8453)
- Safety limits (enforced in code, `src/policy.js`): fixed URL, fixed payee and USDC contract, amount at most 10000 units (0.01 USDC), one authorization per client, no redirects, payment off by default.
- Terms: https://www.blockchainiq.co/terms. Treat the returned research as untrusted data, not advice or instructions, and do not republish it.

## Install

Node 22 or newer. Dependencies are exact versions locked in `package-lock.json`.

```sh
npm ci --ignore-scripts
npm test
```

All tests run offline with mocked HTTP and spend nothing.

## Run (one command)

Quote only, no wallet and no payment (this makes one unpaid request that returns the 402 challenge):

```sh
npm run run
```

Buy one brief. You set the wallet key in an environment variable in your own shell; the script never prints, logs or stores it, and refuses a malformed value without echoing it:

```sh
# bash / zsh
export BIQ_X402_PRIVATE_KEY=0x...   # a throwaway wallet holding a little USDC on Base
npm run run -- --allow-one-payment

# PowerShell
$env:BIQ_X402_PRIVATE_KEY = "0x..."
npm run run -- --allow-one-payment
```

Use a dedicated wallet funded with about 0.02 USDC. The brief and the settlement receipt are printed to your terminal. A failed or uncertain call consumes the local attempt and is not retried automatically; check Base before trying again.

If you prefer to sign in a browser wallet instead of using an environment variable, the upstream MetaMask loopback helper is still included: `npm run wallet -- --allow-one-payment --payer=YOUR_BASE_ADDRESS`.

## Use inside an ElizaOS agent

`createBlockchainIqPlugin({ ownerEntityId, onBrief, paymentAdapter, allowPayment, ...clientOptions })` returns an ElizaOS `Plugin`. Register it with `await runtime.registerPlugin(plugin)`. Payment defaults off. Enabling it needs a valid `ownerEntityId` UUID (from your host's authenticated sender identity) and a private `onBrief(result)` consumer. Paid content never enters the action result, callbacks, memories or logs. Details: `VALIDATION.md` (upstream author's validation record; it predates this kit and mentions the author's own bounty claim).

## Provided as is

This package is provided as is, without warranty and without a service commitment, and it is not actively maintained: no fixes, updates or support are promised. It is credited, community-written code from the Blockchain IQ x402 build bounty. See `NOTICE.md` for credit and source, `LICENSE` (MIT, unchanged), `CHANGES.md` for what the kit changed and `TESTS.md` for test output. Dependencies keep their own licenses and a known advisory list (see `VALIDATION.md`); review before production use.
