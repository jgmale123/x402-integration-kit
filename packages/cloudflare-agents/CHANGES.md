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
