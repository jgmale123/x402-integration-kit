# Test results

## Version 1.1.0, run 11/24/2026 5:22 AM Central

Windows 11, Node v24.19.0. Command, run in this folder:

```
npm test
```

Result: 16 tests, 16 passed, 0 failed. The tests make no request to blockchainiq.co and use no real key.

### Live checks (free, nothing signed), 11/24/2026

1. `npm run catalog` listed the live catalogue through the AgentKit action `list_resources` (49 resources, 6 free).

### Real paid call

No real paid call has been made with this version: the session that wrote it had no wallet key it was allowed to use. The signing path is covered offline only.

### Real output

```
> blockchainiq-x402-agentkit@1.1.0 test
> node --test test/*.test.js

bigint: Failed to load bindings, pure JS will be used (try npm run rebuild?)
✔ four actions: the original two first, then list_resources and get_resource (5.8225ms)
✔ list_resources is free, signs nothing and lists well-formed resources only (5.6597ms)
✔ get_resource buys from a two-rail quote on Base, with path and query parameters (20.4594ms)
✔ a free resource is read without signing (1.6938ms)
✔ a resource above the per-call limit is refused before any request to it; raising the limit buys it (4.9656ms)
✔ maxTotal stops spending across calls (4.6505ms)
✔ unknown resources, unknown parameters and unsafe path values make no paid request (2.0727ms)
✔ the schema rejects extra arguments and malformed ids; the constructor rejects bad limits (9.6803ms)
bigint: Failed to load bindings, pure JS will be used (try npm run rebuild?)
✔ supportsNetwork only Base mainnet (3.0921ms)
✔ exposes two actions; brief pays and returns settlement (17.4491ms)
✔ refuses over-cap payment without signing (2.0857ms)
✔ 402 challenge: paid retry succeeds, one signature, URL is the brief endpoint (3.6004ms)
✔ unsatisfied 402 (server keeps demanding payment) returns an Error string (2.6122ms)
✔ HTTP error after payment returns an Error string with status (2.853ms)
✔ malformed body (not JSON) on a 200 does not throw; data is an empty object (3.3607ms)
✔ event-risk action builds the days query (2.7283ms)
ℹ tests 16
ℹ suites 0
ℹ pass 16
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 16831.9706
```

<!-- earlier runs below -->

# Earlier runs (kept as recorded)

## Test results

Command: `npm test` (runs `node --test test/*.test.js`) in this folder, run 1 Nov 2026 after `npm ci --ignore-scripts`. Offline: mocked fetch and stub signer only.

```

> blockchainiq-x402-agentkit@1.0.0 test
> node --test test/*.test.js

bigint: Failed to load bindings, pure JS will be used (try npm run rebuild?)
✔ supportsNetwork only Base mainnet (1.3422ms)
✔ exposes two actions; brief pays and returns settlement (10.0038ms)
✔ refuses over-cap payment without signing (1.0919ms)
✔ 402 challenge: paid retry succeeds, one signature, URL is the brief endpoint (1.7388ms)
✔ unsatisfied 402 (server keeps demanding payment) returns an Error string (1.5646ms)
✔ HTTP error after payment returns an Error string with status (2.2512ms)
✔ malformed body (not JSON) on a 200 does not throw; data is an empty object (1.7643ms)
✔ event-risk action builds the days query (1.8882ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7303.4153
```

