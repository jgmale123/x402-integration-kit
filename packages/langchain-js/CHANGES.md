# Changes from the upstream commit b2bbe864

Nothing in `src/index.js`, `src/policy.js`, `src/sdk-payment.js`, the wallet server or the upstream tests was changed. Dependency versions were already exact in `package.json` and pinned in `package-lock.json`; they are unchanged.

Additions:

1. `src/env-wallet.js` (new). Why: the upstream code has no way to use a wallet from the command line; the kit needs a one-command run. Reads the private key from `BIQ_WALLET_PRIVATE_KEY`, checks it is `0x` plus 64 hex characters, and builds the upstream `createSdkPaymentAdapter` with viem's `privateKeyToAccount(...).signTypedData`. The key is never logged and never appears in an error message. All upstream spend guards still apply.
2. `scripts/run.js` and the npm script `brief` (new). Why: the one-command run. Makes one paid call and prints the brief and receipt.
3. `test/kit-scenarios.test.js` (new, 6 tests). Why: names the success, 402 challenge, HTTP error and malformed-body cases and tests the env-wallet error paths, offline.
4. `README.md` replaced by the kit README; the upstream README is kept as `UPSTREAM-README.md`.
5. `package.json`: added the `brief` script and the new files to `files`.
6. `NOTICE.md`, `CHANGES.md`, `TESTS.md` (new).

## Version 0.2.0 (11/24/2026): every catalogue resource, and a fix for two-rail quotes

These changes do alter upstream files. Each is marked in the code with "Changed by Blockchain IQ" or "Added by Blockchain IQ".

1. `src/policy.js`. Why: on 11/24/2026 the live API answered every paid resource with two payment options, USDC on Base and USDC on Solana, and the upstream rule "exactly one option" refused them all (`npm run quote` returned `UNSAFE_PAYMENT_QUOTE`). The rule is now: exactly one option on Base to the pinned payee and token; options on other networks are dropped unsigned. The URL and the largest amount are passed in as a context, which defaults to the brief at 0.01 USDC, so the original tool is unchanged. Added `usdToUnits`, `unitsToUsd`, `BRIEF_CONTEXT`, and a ceiling of 25.00 USDC per call that no option can raise.
2. `src/catalog.js` (new). Why: to offer every resource, not only the brief. Reads the free catalogue, keeps well-formed GET entries, and builds one URL on the fixed origin from a resource id and its listed parameters.
3. `src/index.js`. Why: the same guarded payment path now serves any catalogue resource. The upstream client logic moved into a shared engine with no change to its checks; `createBriefClient` and `createBlockchainIqBriefTool` keep their behavior. Added `createBlockchainIqClient` and `createBlockchainIqTools` (`blockchainiq_catalog`, `blockchainiq_get`) with owner-set limits: `maxPricePerCallUsd`, `maxPayments`, `maxTotalUsd`. The header size limit rose from 64 KB to 256 KB because live quotes carry example responses.
4. `src/sdk-payment.js`. Why: the adapter must check the quote against the same context as the client, and the x402 SDK refuses payments above $1 unless told otherwise; its cap is now set to the call limit, for USDC on Base only.
5. `scripts/quote.js` (changed), `scripts/catalog.js`, `scripts/get.js`, `scripts/args.js` (new) and the npm scripts `catalog` and `get`.
6. `test/catalog-client.test.js` (new, 16 tests). The 66 earlier tests are unchanged and still pass.
7. `README.md`, `TESTS.md`, `package.json` (version 0.2.0, description, scripts).
