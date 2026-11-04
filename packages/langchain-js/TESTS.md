# Test results

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
