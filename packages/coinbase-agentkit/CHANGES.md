# Changes from source commit 10d2884d5165986847babf812d0c87956189b543

No file under `src/` or `examples/` was changed. `package.json` and `package-lock.json` are unchanged (lockfile versions kept; installed with `npm ci --ignore-scripts`).

1. `README.md` replaced with a Blockchain IQ kit README. The original is kept as `UPSTREAM-README.md`. Reason: the original says "Not affiliated with Blockchain IQ", which is no longer accurate for this kit, and it lacked the as-is statement and the environment-variable run command.
2. `test/testlib.js`: `testSigner()` no longer generates a private key (it used viem `generatePrivateKey`). It is now a stub with a fixed public dummy address and a dummy signature, so no key is created anywhere in the tests. Added helpers `mockFetchPaid` and `mockFetch402Only`. Existing mock server unchanged.
3. `test/provider.test.js`: the 3 original tests are unchanged; 5 tests appended (402 challenge flow and URL, unsatisfied 402, HTTP 500 after payment, malformed non-JSON body, event-risk query). No test calls the network.
4. Added `NOTICE.md`, `CHANGES.md`, `TESTS.md`, `UPSTREAM-README.md`.

Not changed (observed in code): `getActions` is overridden to return plain `{name, description, schema, invoke}` objects, not built with AgentKit's `@CreateAction` decorator (see README "Known limitation"). `package.json` `repository.url` (astratc) differs from the clone's origin (astra-tc); left as is.

## Version 1.1.0 (11/24/2026): every catalogue resource

These changes do alter files under `src/`. Each is marked in the code with "Added by Blockchain IQ".

1. `src/catalog.js` (new). Why: to offer every resource, not only the brief and event risk. Reads the free catalogue and builds one URL on the fixed origin from a resource id and its listed parameters.
2. `src/core.js`: added `loadCatalog` and `callResource`. A resource priced above `maxPerCall` is refused before anything is signed.
3. `src/index.js`: added the actions `list_resources` and `get_resource` and the option `maxTotal`; `maxPerCall` may not exceed 25. The two original actions are unchanged and listed first.
4. `test/catalog.test.js` (new), including a two-rail (Base and Solana) quote; one line of `test/provider.test.js` changed for the new action count. 16 tests pass in total.
5. `examples/get-resource.js` (new) and the npm scripts `catalog` and `get`.
6. `README.md`, `TESTS.md`, `package.json` (version 1.1.0, scripts).

Not verified: whether the published 1.0.0 paid correctly against a two-rail quote. It registered the Base scheme only; no paid call was made with it on or after 11/24/2026.
