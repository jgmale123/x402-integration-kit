# Changes from the source commit 49ce21b7467adf8ad81f4c2d4e01e6255d238f9a

No runtime behavior of `src/` was changed. Every source file under `src/` is byte-identical to the source.

| Change | File | Why |
| --- | --- | --- |
| Renamed the author's README | `README.md` to `UPSTREAM-README.md` | Keeps the author's text unchanged; the kit README is new. |
| Added a kit README | `README.md` | Install, one-command run, endpoint, as-is statement. |
| Added `NOTICE.md`, `CHANGES.md`, `TESTS.md` | new | Credit, change log, real test output. |
| Added `scripts/run-local.mjs` and a `start` script | `scripts/run-local.mjs`, `package.json` | The source needs a hand-written `.dev.vars` file. The script writes it from `PROJECT_EVM_PRIVATE_KEY` and `INVOCATION_TOKEN` environment variables (mode 0600, git-ignored), then starts `wrangler dev --local`. It prints no secret and hardcodes none. |
| Added `test/fixtures.test.ts` | new | Offline fixture tests for success, 402 challenge, HTTP error and malformed body. They run the real Agent class in local Miniflare with answers from local fixtures. |

Observed in the source and deliberately not changed (not verified as a bug, behavior left as is):

- `src/policy.ts` error text says "approved brief URL" although the resource is event-risk. Text only.
- The Worker allows exactly one paid call per Durable Object state, by design (the one-call latch). To make a second paid call, use a new local state.
- `LIVE_PAYMENT.json`, `VALIDATION.md` and `SOURCE_ORIGIN.json` are the author's records of its own bounty claim and are kept unchanged. LIVE_PAYMENT.json holds only public transaction data (addresses, transaction hash, block hash, a response checksum); it holds no key, token or secret. Its statements about the bounty review are the author's, as of 25 Oct 2026.

## Version 0.2.0 (11/24/2026): every catalogue resource, and a fix for two-rail quotes

These changes do alter files under `src/`. Each is marked in the code with "Changed by Blockchain IQ" or "Added by Blockchain IQ". The statement above that `src/` is byte-identical to the source no longer holds.

1. `src/policy.ts`. Why: on 11/24/2026 the live API answered every paid resource with two payment options, USDC on Base and USDC on Solana, and the source rule "exactly one option" (`requirements.length !== 1`) refused them all, so `POST /event-risk` could no longer pay. The rule is now: exactly one option on Base that matches the policy; options on other networks are ignored and never signed. The checks take a policy object (the exact URL, the most the call may cost, and whether the price must equal it); the default policy is the original event-risk rule at exactly 0.05 USDC. Added `usdToAtoms` and a ceiling of 25.00 USDC a call.
2. `src/payment.ts`. `validateAuthorization` and `guardedSigner` take the policy; added `resourceClient`, which signs exactly the amount the server quoted and never more than the policy allows. The event-risk clients are unchanged in behavior.
3. `src/catalog.ts`, `src/limits.ts` (new). The free catalogue reader and URL builder, and the owner limits `MAX_PRICE_PER_CALL_USD`, `MAX_PAYMENTS`, `MAX_TOTAL_USD`.
4. `src/index.ts`. Added `GET /catalog`, `POST /resource` and `GET /ledger`. A payment is reserved in Durable Object storage before anything is signed and is never refunded automatically. The wallet signs at most the catalogue price, which is stricter than the other packages (they allow a quote up to the per-call limit). `POST /event-risk`, `/health` and `/receipt` are unchanged.
5. `test/resource.test.ts` (new, 11 tests). The 25 earlier tests are unchanged and still pass.
6. `scripts/get-resource.mjs` (new) and the npm script `resource`; `scripts/run-local.mjs` passes the three limit variables through when set.
7. `README.md`, `TESTS.md`, `package.json` (version 0.2.0).
