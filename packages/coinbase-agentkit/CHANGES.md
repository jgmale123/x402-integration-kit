# Changes from source commit 10d2884d5165986847babf812d0c87956189b543

No file under `src/` or `examples/` was changed. `package.json` and `package-lock.json` are unchanged (lockfile versions kept; installed with `npm ci --ignore-scripts`).

1. `README.md` replaced with a Blockchain IQ kit README. The original is kept as `UPSTREAM-README.md`. Reason: the original says "Not affiliated with Blockchain IQ", which is no longer accurate for this kit, and it lacked the as-is statement and the environment-variable run command.
2. `test/testlib.js`: `testSigner()` no longer generates a private key (it used viem `generatePrivateKey`). It is now a stub with a fixed public dummy address and a dummy signature, so no key is created anywhere in the tests. Added helpers `mockFetchPaid` and `mockFetch402Only`. Existing mock server unchanged.
3. `test/provider.test.js`: the 3 original tests are unchanged; 5 tests appended (402 challenge flow and URL, unsatisfied 402, HTTP 500 after payment, malformed non-JSON body, event-risk query). No test calls the network.
4. Added `NOTICE.md`, `CHANGES.md`, `TESTS.md`, `UPSTREAM-README.md`.

Not changed (observed in code): `getActions` is overridden to return plain `{name, description, schema, invoke}` objects, not built with AgentKit's `@CreateAction` decorator (see README "Known limitation"). `package.json` `repository.url` (astratc) differs from the clone's origin (astra-tc); left as is.
