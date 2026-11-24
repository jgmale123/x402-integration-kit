# Test results

## Version 0.2.0, run 11/24/2026 5:22 AM Central

Windows 11, Node v24.19.0. Command, run in this folder:

```
npm test
```

Result: 82 tests, 82 passed, 0 failed (66 earlier tests unchanged, 16 added in `test/catalog-client.test.js`). The tests make no request to blockchainiq.co and use no real key.

### Live checks (free, nothing signed), 11/24/2026

1. `npm run quote` returned the unpaid quote for `brief` (10000 units, USDC on Base, pinned payee). Before version 0.2.0 this command failed with `UNSAFE_PAYMENT_QUOTE` because the live quote now carries a second, Solana option.
2. `npm run quote -- --all` was run earlier on 11/24/2026: every quoted price equaled the catalogue price.

### Real paid call

No real paid call has been made with this version: the session that wrote it had no wallet key it was allowed to use. The signing path is covered offline only.

### Real output

```
> blockchainiq-langchain-brief@0.2.0 test
> node --test

✔ real SDK handshake signs one EIP-3009 authorization and returns original envelope (142.7891ms)
✔ real LangChain tool accepts an empty object, and ToolCall returns ToolMessage + receipt artifact (24.636ms)
✔ plain tool.invoke({}) returns the JSON content string (6.0089ms)
✔ default is unpaid; 402 does not invoke signer (13.7778ms)
✔ quote reads only the fixed unpaid URL, ignores advertised extensions (10.7257ms)
✔ LangChain rejects URL and payment override arguments before network access (2.1873ms)
✔ rejects wrong chain before asking wallet (2.0652ms)
✔ rejects wrong token before asking wallet (1.1894ms)
✔ rejects wrong recipient before asking wallet (7.2104ms)
✔ rejects too expensive before asking wallet (2.1342ms)
✔ rejects negative amount before asking wallet (1.3758ms)
✔ rejects fractional amount before asking wallet (0.8009ms)
✔ rejects leading zero amount before asking wallet (0.5793ms)
✔ rejects zero amount before asking wallet (0.7072ms)
✔ rejects too long authorization before asking wallet (0.7831ms)
✔ rejects wrong protocol before asking wallet (0.6748ms)
✔ rejects alternate endpoint before asking wallet (0.5705ms)
✔ rejects multiple options before asking wallet (0.72ms)
✔ rejects permit2 before asking wallet (5.5892ms)
✔ rejects other domain before asking wallet (1.9414ms)
✔ a lower positive price is accepted within the one-cent maximum (0.3774ms)
✔ at most one simultaneous run can reach wallet even before it resolves (36.8455ms)
✔ wallet failure is sanitized and reservation is never automatically restored (2.8846ms)
✔ wallet timeout aborts the pending operation and a late signature is never submitted (42.3103ms)
✔ pre-aborted operation performs no fetch and no signing (0.8722ms)
✔ unexpected free/unauthorized response does not count as a paid success (1.5268ms)
✔ redirects cannot move the request or signature to another host (0.5265ms)
✔ malformed and excessive headers fail before payment (2.213ms)
✔ second 402 or 500 produces no further request or signature (2.9668ms)
✔ missing or mismatched settlement receipt cannot be a success (7.5019ms)
✔ invalid brief or oversized paid body fails while retaining payment reservation (19.6015ms)
✔ custom adapter cannot change authorized value, recipient, or signer (4.7023ms)
✔ RPC helper normalizes BigInt and supplies explicit EIP712Domain fields (3.6963ms)
✔ catalog lists well-formed GET resources only, with prices and parameters (82.1732ms)
✔ a two-rail quote (Base and Solana) is accepted and only the Base option is kept (13.4991ms)
✔ default limits buy a five-cent resource once, at the URL built from the parameters (39.7817ms)
✔ free resources are read without a wallet and without touching the budget (2.5736ms)
✔ payment stays off by default: a paid resource stops at PAYMENT_DISABLED and never signs (2.8962ms)
✔ a resource priced above the per-call limit is refused before any request to it (2.4104ms)
✔ the owner can raise the limit deliberately to buy a dollar-priced resource (36.4684ms)
✔ a server quote above the catalogue price and above the limit is refused unsigned (2.7173ms)
✔ several payments stop at the total and at the payment count (12.6932ms)
✔ unknown resources, unknown parameters and unsafe path values make no paid request (2.9759ms)
✔ altered Base options are refused even when a second rail is present (22.9922ms)
✔ the adapter signs nothing above the context it is given, and only the brief with no context (5.1898ms)
✔ invalid limits are rejected at construction (1.3142ms)
✔ a paid body without the Blockchain IQ envelope is rejected and the reservation is kept (3.2998ms)
✔ catalogue parsing and URL building never leave the fixed origin (0.7597ms)
✔ LangChain tools: the catalogue tool is free and the get tool rejects extra arguments before any request (38.7639ms)
✔ test\fixtures.js (2774.2374ms)
✔ success: 402 challenge then paid 200 returns the brief and receipt (98.6691ms)
✔ 402 challenge: unpaid quote reads the challenge and signs nothing (4.6093ms)
✔ HTTP error: a 500 after the challenge fails without a retry (5.2285ms)
✔ malformed body: non-JSON paid body is rejected (7.8431ms)
✔ malformed body: JSON that is not a Blockchain IQ brief is rejected (6.1377ms)
✔ env wallet: missing and malformed variable fail without echoing the value (0.8983ms)
✔ accepts the intended one-cent EIP-3009 authorization (3.6108ms)
✔ refuses altered network (0.7421ms)
✔ refuses altered token (0.2888ms)
✔ refuses altered domain name (0.2484ms)
✔ refuses altered domain version (0.3667ms)
✔ refuses altered extra domain field (0.2949ms)
✔ refuses altered recipient (0.2861ms)
✔ refuses altered amount (0.2914ms)
✔ refuses altered payer (0.2888ms)
✔ refuses altered authorization schema (0.3975ms)
✔ refuses altered type field (0.5906ms)
✔ refuses altered extra type (0.4595ms)
✔ refuses altered extra message field (0.2681ms)
✔ refuses altered nonce (0.5124ms)
✔ refuses altered expired signature (0.3313ms)
✔ refuses altered nonzero validAfter (0.7173ms)
✔ refuses altered over-five-minute lifetime (0.3861ms)
✔ refuses altered long lifetime (0.2833ms)
✔ preview cannot start a payment and session endpoints reject unauthenticated and cross-origin calls (183.1483ms)
✔ one live attempt waits for a real local fixture signature, returns receipt only, and refuses a second attempt (162.7676ms)
✔ the owner can decline before the integration receives a signature (73.3175ms)
✔ the real SDK and LangChain tool complete the local bridge using only a synthetic owner signature and mocked upstream (137.1791ms)
✔ the public x402 schema exports resolve the explicitly scoped Zod 4.6.7 override (3.8693ms)
✔ the actual x402 Any schema preserves the SDK single-argument record path (3.5915ms)
✔ public x402 schemas validate the unsigned quote and reject malformed quote shapes (13.4542ms)
✔ public x402 schemas validate a real SDK payload signed only by the public synthetic wallet (63.3877ms)
ℹ tests 82
ℹ suites 0
ℹ pass 82
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6428.966
```

<!-- earlier runs below -->

# Earlier runs (kept as recorded)

## Test results

Command (run inside this folder after `npm ci --ignore-scripts`; offline, mocked fixtures, no wallet key, no network call to blockchainiq.co):

```
npm test
```

Output as run on 1 Nov 2026 (Node v24.19.0):

```

> blockchainiq-langchain-brief@0.1.0 test
> node --test

✔ real SDK handshake signs one EIP-3009 authorization and returns original envelope (73.9048ms)
✔ real LangChain tool accepts an empty object, and ToolCall returns ToolMessage + receipt artifact (25.2759ms)
✔ plain tool.invoke({}) returns the JSON content string (8.5738ms)
✔ default is unpaid; 402 does not invoke signer (6.1251ms)
✔ quote reads only the fixed unpaid URL, ignores advertised extensions (1.4518ms)
✔ LangChain rejects URL and payment override arguments before network access (2.8201ms)
✔ rejects wrong chain before asking wallet (2.555ms)
✔ rejects wrong token before asking wallet (2.0645ms)
✔ rejects wrong recipient before asking wallet (6.9914ms)
✔ rejects too expensive before asking wallet (1.9559ms)
✔ rejects negative amount before asking wallet (1.2695ms)
✔ rejects fractional amount before asking wallet (2.0364ms)
✔ rejects leading zero amount before asking wallet (1.4149ms)
✔ rejects zero amount before asking wallet (2.3245ms)
✔ rejects too long authorization before asking wallet (1.737ms)
✔ rejects wrong protocol before asking wallet (0.9965ms)
✔ rejects alternate endpoint before asking wallet (0.7436ms)
✔ rejects multiple options before asking wallet (2.6683ms)
✔ rejects permit2 before asking wallet (1.1747ms)
✔ rejects other domain before asking wallet (1.1291ms)
✔ a lower positive price is accepted within the one-cent maximum (0.2505ms)
✔ at most one simultaneous run can reach wallet even before it resolves (22.8677ms)
✔ wallet failure is sanitized and reservation is never automatically restored (3.0725ms)
✔ wallet timeout aborts the pending operation and a late signature is never submitted (63.2425ms)
✔ pre-aborted operation performs no fetch and no signing (1.1568ms)
✔ unexpected free/unauthorized response does not count as a paid success (1.8908ms)
✔ redirects cannot move the request or signature to another host (0.5515ms)
✔ malformed and excessive headers fail before payment (1.7509ms)
✔ second 402 or 500 produces no further request or signature (2.8231ms)
✔ missing or mismatched settlement receipt cannot be a success (6.9515ms)
✔ invalid brief or oversized paid body fails while retaining payment reservation (6.5964ms)
✔ custom adapter cannot change authorized value, recipient, or signer (3.5606ms)
✔ RPC helper normalizes BigInt and supplies explicit EIP712Domain fields (1.116ms)
✔ test\fixtures.js (2603.3409ms)
✔ success: 402 challenge then paid 200 returns the brief and receipt (57.9283ms)
✔ 402 challenge: unpaid quote reads the challenge and signs nothing (1.301ms)
✔ HTTP error: a 500 after the challenge fails without a retry (3.7983ms)
✔ malformed body: non-JSON paid body is rejected (3.2088ms)
✔ malformed body: JSON that is not a Blockchain IQ brief is rejected (3.439ms)
✔ env wallet: missing and malformed variable fail without echoing the value (0.8917ms)
✔ accepts the intended one-cent EIP-3009 authorization (4.1376ms)
✔ refuses altered network (1.2872ms)
✔ refuses altered token (0.5224ms)
✔ refuses altered domain name (1.152ms)
✔ refuses altered domain version (0.7504ms)
✔ refuses altered extra domain field (0.6418ms)
✔ refuses altered recipient (0.626ms)
✔ refuses altered amount (0.4973ms)
✔ refuses altered payer (1.0401ms)
✔ refuses altered authorization schema (0.427ms)
✔ refuses altered type field (0.656ms)
✔ refuses altered extra type (0.3265ms)
✔ refuses altered extra message field (0.7669ms)
✔ refuses altered nonce (0.4838ms)
✔ refuses altered expired signature (0.5177ms)
✔ refuses altered nonzero validAfter (0.4561ms)
✔ refuses altered over-five-minute lifetime (0.3853ms)
✔ refuses altered long lifetime (0.3593ms)
✔ preview cannot start a payment and session endpoints reject unauthenticated and cross-origin calls (180.0537ms)
✔ one live attempt waits for a real local fixture signature, returns receipt only, and refuses a second attempt (109.8538ms)
✔ the owner can decline before the integration receives a signature (60.0032ms)
✔ the real SDK and LangChain tool complete the local bridge using only a synthetic owner signature and mocked upstream (76.5013ms)
✔ the public x402 schema exports resolve the explicitly scoped Zod 4.6.7 override (8.4336ms)
✔ the actual x402 Any schema preserves the SDK single-argument record path (3.5125ms)
✔ public x402 schemas validate the unsigned quote and reject malformed quote shapes (26.4626ms)
✔ public x402 schemas validate a real SDK payload signed only by the public synthetic wallet (54.926ms)
ℹ tests 66
ℹ suites 0
ℹ pass 66
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5110.0298
```

