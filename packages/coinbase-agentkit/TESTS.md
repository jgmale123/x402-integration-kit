# Test results

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
