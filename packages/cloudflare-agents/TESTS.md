# Test results

Command (run in this folder, Node v24.19.0, after `npm ci --ignore-scripts --no-audit --no-fund`, 220 packages):

```
npm run check
```

Result: TypeScript check clean; 25 tests, 25 passed, 0 failed. No request was sent to blockchainiq.co and no key was used other than keys generated in memory by the tests.

- 17 tests from the source (policy, payment guards, Miniflare Agent runtime including a 302 redirect case).
- 8 tests added by the kit in test/fixtures.test.ts: success, 402 challenge with changed terms, 402 with no challenge header, HTTP 500 after payment, HTTP 500 on the unpaid request, malformed paid body, malformed PAYMENT-RESPONSE header, malformed request body.

Real output:

```
✔ fixture success: 402 challenge, one paid retry, JSON result and provider-reported evidence (2316.8005ms)
✔ fixture 402 challenge with changed terms is refused before anything is signed (1878.0627ms)
✔ fixture 402 with no PAYMENT-REQUIRED header is refused without signing (1721.7542ms)
✔ fixture HTTP error after payment returns 502, retains evidence, and a retry is refused (1960.6288ms)
✔ fixture HTTP error on the unpaid request (500, no challenge) returns 502 and signs nothing (1800.4343ms)
✔ fixture malformed paid body (200 but not JSON) returns 502 and the receipt is retained (2031.4591ms)
✔ fixture malformed PAYMENT-RESPONSE header is not accepted as a receipt (1893.8406ms)
✔ fixture malformed request body to the Worker is rejected with 400 and makes no outbound call (1568.0444ms)
✔ pinned x402 SDK passes the strict actual signing-request guard (15.2581ms)
✔ protected adapter preserves original nonce, validity and signature through the SDK (16.4779ms)
✔ a calibrated chain clock rejects a capability that a slow host still accepts (10.5805ms)
✔ protected adapter verifies signature, original intent and every signed payment field (10.1491ms)
✔ invalid actual SDK signing requests never reach the underlying signer (4.1016ms)
✔ protected proof cannot change during recovery and concurrent payload creation is refused (13.498ms)
✔ a receipt is provider evidence, and missing or inconsistent evidence is never settlement (0.7053ms)
✔ accepts the observed exact five-cent Base USDC requirement (1.4254ms)
✔ the separate one-cent brief invoice cannot authorize an event-risk purchase (0.767ms)
✔ rejects changed or ambiguous payment terms (0.4421ms)
✔ accepts only the fixed GET resource and exact current challenge (0.8107ms)
✔ local Agent runtime preserves one-call state: receipt (1952.742ms)
✔ local Agent runtime preserves one-call state: protected-receipt (2000.0349ms)
✔ local Agent runtime preserves one-call state: protected-clock-receipt (1879.3577ms)
✔ local Agent runtime preserves one-call state: missing-receipt (1983.4101ms)
✔ local Agent runtime preserves one-call state: lost-response (1838.737ms)
✔ local Agent runtime preserves one-call state: redirect (1867.8109ms)
ℹ tests 25
ℹ suites 0
ℹ pass 25
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 21087.7604
```
