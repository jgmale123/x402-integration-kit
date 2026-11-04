# Changes from the upstream commit b2bbe864

Nothing in `src/index.js`, `src/policy.js`, `src/sdk-payment.js`, the wallet server or the upstream tests was changed. Dependency versions were already exact in `package.json` and pinned in `package-lock.json`; they are unchanged.

Additions:

1. `src/env-wallet.js` (new). Why: the upstream code has no way to use a wallet from the command line; the kit needs a one-command run. Reads the private key from `BIQ_WALLET_PRIVATE_KEY`, checks it is `0x` plus 64 hex characters, and builds the upstream `createSdkPaymentAdapter` with viem's `privateKeyToAccount(...).signTypedData`. The key is never logged and never appears in an error message. All upstream spend guards still apply.
2. `scripts/run.js` and the npm script `brief` (new). Why: the one-command run. Makes one paid call and prints the brief and receipt.
3. `test/kit-scenarios.test.js` (new, 6 tests). Why: names the success, 402 challenge, HTTP error and malformed-body cases and tests the env-wallet error paths, offline.
4. `README.md` replaced by the kit README; the upstream README is kept as `UPSTREAM-README.md`.
5. `package.json`: added the `brief` script and the new files to `files`.
6. `NOTICE.md`, `CHANGES.md`, `TESTS.md` (new).
