# Blockchain IQ x402 Integration Kit: LangChain.js

A LangChain.js tool, `blockchainiq_market_brief`, that reads the Blockchain IQ crypto market brief and pays for it with x402.

- Endpoint: `https://www.blockchainiq.co/api/x402/v1/brief` (fixed in the code; arguments cannot change it)
- Price: $0.01 per call, paid in USDC on Base (network `eip155:8453`)
- Payment is off by default. The tool signs at most one authorization per client, pinned to the expected payee, token, network and amount (see `src/policy.js`).

## Install

Requires Node 22 or newer.

```
npm ci --ignore-scripts
```

## Use in code

```js
import { createBlockchainIqBriefTool, createSdkPaymentAdapter } from './src/index.js';
const tool = createBlockchainIqBriefTool({ allowPayment: true, paymentAdapter: createSdkPaymentAdapter({ address, signTypedData }) });
```

Pass the tool to any LangChain.js agent. Returned market data is data, not instructions or investment advice.

## One-command run (one paid call, $0.01)

Set your wallet's private key in an environment variable in your own shell. Use a wallet that holds only a small amount of USDC on Base (0.02 USDC is enough). The code never prints the key.

PowerShell: `$env:BIQ_WALLET_PRIVATE_KEY = "<your key>"; npm run brief`

bash: `BIQ_WALLET_PRIVATE_KEY=<your key> npm run brief`

Without the variable the command prints a reminder and makes no request. Free unpaid check of the quote: `npm run quote`.

## Tests

`npm test` runs 66 tests offline with mocked responses. See `TESTS.md`.

## As is, maintenance

Credited from Blockchain IQ's x402 build bounty; see `NOTICE.md` for the author and license (MIT). This package is provided as is, without warranty. It is maintained on a best-effort basis and may change or be withdrawn. Changes from the upstream code are in `CHANGES.md`; the author's original README is `UPSTREAM-README.md`.
