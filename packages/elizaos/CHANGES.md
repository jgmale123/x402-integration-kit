# Changes from upstream (commit da66d167d1cb0b43d1e1d3a3075c11e901dfda4f)

Source files `src/*`, upstream scripts and upstream tests are unchanged. `package-lock.json` is unchanged (dependencies in `package.json` were already exact versions, all present in the lock).

1. Added `scripts/run-env.js` and the `run` npm script. Reason: the upstream package has no way to supply a wallet from an environment variable (only a MetaMask loopback page). Reads `BIQ_X402_PRIVATE_KEY`, validates its shape without echoing it, builds the signer with viem and the upstream `createSdkPaymentAdapter` and `createElizaBriefRunner`, so every upstream payment guard still applies. Without `--allow-one-payment` it only requests the unpaid 402 quote. This is new behavior, not a bug fix.
2. Added `test/run-env.test.js` (7 offline tests for item 1).
3. Rewrote `README.md` (original saved nowhere in this package; see the upstream repository). Reason: the upstream README described an unsubmitted bounty build and a claim email, which is stale and not accurate for the kit. Technical statements were kept; the endpoint, price and limits were checked against `src/policy.js`.
4. Appended a kit section to `NOTICE.md` (original text kept above it).
5. `package.json`: added the `run` script and listed `CHANGES.md` and `TESTS.md` in `files`. Nothing else.
6. Added `TESTS.md`, this file.

Not changed: `LICENSE`, `VALIDATION.md` (still the upstream author's 24-25 Oct record, including its bounty-claim note and its dependency audit statement), `.gitignore`.

Observed, not fixed: `npm audit` on 1 Nov 2026 reported 7 vulnerabilities (4 low, 3 moderate), while `VALIDATION.md` records 0 moderate and 5 low. The difference was not investigated.

## Version 0.2.0 (11/24/2026): every catalogue resource, and a fix for two-rail quotes

These changes do alter upstream files. Each is marked in the code with "Changed by Blockchain IQ" or "Added by Blockchain IQ".

1. `src/policy.js`, `src/sdk-payment.js`. Why: on 11/24/2026 the live API answered every paid resource with two payment options, USDC on Base and USDC on Solana, and the upstream rule "exactly one option" (`accepts.length !== 1`) refused them all. The rule is now: exactly one option on Base to the pinned payee and token; options on other networks are dropped unsigned. Both files are the same as in `packages/langchain-js`.
2. `src/catalog.js` (new). Why: to offer every resource, not only the brief. Reads the free catalogue and builds one URL on the fixed origin from a resource id and its listed parameters.
3. `src/client.js`. Why: rebuilt on the shared engine used in `packages/langchain-js`, with the same checks; `createBriefClient` keeps its behavior. Added `createBlockchainIqClient` with owner-set limits `maxPricePerCallUsd`, `maxPayments`, `maxTotalUsd`.
4. `src/index.js`, `src/runner.js`. Added `createBlockchainIqCatalogPlugin` (action `BLOCKCHAINIQ_GET`, option `allowedResources`) and `createElizaCatalogRunner`. The brief plugin is unchanged.
5. `scripts/get.js` (new) and the npm scripts `get` and `catalog`.
6. `test/catalog-plugin.test.js` (new). 76 tests pass in total.
7. `README.md`, `TESTS.md`, `package.json` (version 0.2.0, description, scripts).
