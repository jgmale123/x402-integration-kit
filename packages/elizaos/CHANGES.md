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
