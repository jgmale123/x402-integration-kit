# Tests

All tests run offline. HTTP is mocked with fixtures (`test/fixtures.js`); the only signer used is the public synthetic test key from the upstream tests (never fund it). No call is made to blockchainiq.co.

Command: `npm test` (alias for `node --test test/*.test.js`), Node v24.19.0, run 1 Nov 2026 in this directory after `npm ci --ignore-scripts`.

Scenario coverage:

| Scenario | Tests |
| --- | --- |
| Success | "real SDK handshake signs one EIP-3009 authorization..." (test/client.test.js); "success path (mocked)" (test/run-env.test.js) |
| 402 challenge | "default is unpaid; 402 does not invoke signer"; the 14 "rejects ... before asking wallet" cases; "402 challenge with wrong payee" (run-env) |
| HTTP error | "unexpected free/unauthorized response..." (200/401/403/500); "second 402 or 500 produces no further request"; "HTTP error on the paid request" (run-env) |
| Malformed body or headers | "malformed and excessive headers fail before payment"; "invalid brief or oversized paid body..."; "missing or mismatched settlement receipt..."; "malformed paid body" (run-env) |

Real output (exit code 0):

```

> @promarty/plugin-blockchainiq@0.1.0 test
> node --test test/*.test.js

✔ real SDK handshake signs one EIP-3009 authorization and returns original envelope (77.899ms)
✔ default is unpaid; 402 does not invoke signer (3.9373ms)
✔ quote reads only the fixed unpaid URL, ignores advertised extensions (1.3279ms)
✔ rejects wrong chain before asking wallet (1.3275ms)
✔ rejects wrong token before asking wallet (23.2109ms)
✔ rejects wrong recipient before asking wallet (1.1551ms)
✔ rejects too expensive before asking wallet (0.8923ms)
✔ rejects negative amount before asking wallet (0.8026ms)
✔ rejects fractional amount before asking wallet (0.8747ms)
✔ rejects leading zero amount before asking wallet (0.8289ms)
✔ rejects zero amount before asking wallet (0.532ms)
✔ rejects too long authorization before asking wallet (0.7296ms)
✔ rejects wrong protocol before asking wallet (0.5287ms)
✔ rejects alternate endpoint before asking wallet (0.6387ms)
✔ rejects multiple options before asking wallet (0.9369ms)
✔ rejects permit2 before asking wallet (0.7789ms)
✔ rejects other domain before asking wallet (0.908ms)
✔ a lower positive price is accepted within the one-cent maximum (1.5212ms)
✔ at most one simultaneous run can reach wallet even before it resolves (22.1642ms)
✔ wallet failure is sanitized and reservation is never automatically restored (2.2067ms)
✔ wallet timeout aborts the pending operation and a late signature is never submitted (58.4973ms)
✔ pre-aborted operation performs no fetch and no signing (0.5834ms)
✔ unexpected free/unauthorized response does not count as a paid success (1.116ms)
✔ redirects cannot move the request or signature to another host (0.3897ms)
✔ malformed and excessive headers fail before payment (1.4353ms)
✔ second 402 or 500 produces no further request or signature (4.5679ms)
✔ missing or mismatched settlement receipt cannot be a success (6.4997ms)
✔ invalid brief or oversized paid body fails while retaining payment reservation (7.1192ms)
✔ custom adapter cannot change authorized value, recipient, or signer (3.8431ms)
✔ RPC helper normalizes BigInt and supplies explicit EIP712Domain fields (1.0531ms)
✔ accepts the intended one-cent EIP-3009 authorization (2.922ms)
✔ refuses altered network (1.1143ms)
✔ refuses altered token (1.4581ms)
✔ refuses altered domain name (0.3966ms)
✔ refuses altered domain version (0.5123ms)
✔ refuses altered extra domain field (0.4037ms)
✔ refuses altered recipient (0.377ms)
✔ refuses altered amount (0.2956ms)
✔ refuses altered payer (0.3654ms)
✔ refuses altered authorization schema (1.796ms)
✔ refuses altered type field (0.3948ms)
✔ refuses altered extra type (0.4779ms)
✔ refuses altered extra message field (1.3327ms)
✔ refuses altered nonce (1.7185ms)
✔ refuses altered expired signature (0.5868ms)
✔ refuses altered nonzero validAfter (0.2468ms)
✔ refuses altered over-five-minute lifetime (0.2364ms)
✔ refuses altered long lifetime (0.2281ms)
✔ an occupied local port rejects cleanly (77.9145ms)
✔ preview cannot start a payment and session endpoints reject unauthenticated and cross-origin calls (101.7789ms)
✔ one live attempt waits for a real local fixture signature, returns receipt only, and refuses a second attempt (188.8437ms)
✔ the owner can decline before the integration receives a signature (120.9397ms)
✔ the real SDK and registered ElizaOS action complete the local bridge using only a synthetic owner signature and mocked upstream (120.1615ms)
✔ real AgentRuntime registers the plugin, dispatches its action, and keeps paid content out of all framework records (132.718ms)
✔ payment-disabled runner stops without any network or signer call (11.2855ms)
✔ stopping the runner aborts an in-flight request before any signature (3.819ms)
✔ handler enforces configured sender and ignores hostile message options even when processActions skips validate (12.3458ms)
✔ changed merchant quote is rejected through real runtime before a signature (3.1728ms)
✔ a private consumer failure cannot put its error or paid response into the ActionResult and cannot restore the payment budget (14.2567ms)
✔ quote-only by default: no key needed, no payment (55.9534ms)
✔ payment flag without the env var fails and does not call the network (1.9349ms)
✔ malformed key is rejected and never echoed (0.4748ms)
✔ success path (mocked): returns brief and receipt, never prints the key (54.2492ms)
✔ HTTP error on the paid request: exit 1, no retry (13.8993ms)
✔ malformed paid body: exit 1 (11.6413ms)
✔ 402 challenge with wrong payee: refused before signing (9.0061ms)
✔ the public x402 schema exports resolve the explicitly scoped Zod 4.6.7 override (6.3219ms)
✔ the actual x402 Any schema preserves the SDK single-argument record path (4.3181ms)
✔ public x402 schemas validate the unsigned quote and reject malformed quote shapes (14.7246ms)
✔ public x402 schemas validate a real SDK payload signed only by the public synthetic wallet (41.3191ms)
ℹ tests 70
ℹ suites 0
ℹ pass 70
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5165.4449
```
