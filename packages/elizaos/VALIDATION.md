# Validation — 24 October 2026

> **Post-packaging record (25 October 2026):** Repository was published and an ElizaOS bounty claim email sent on 24 October at 21:08 UTC. The claim includes transaction hash `0x19360872d70445919de4f5feb11eb2380fdf0f59d93707048e3b060ae87e0f74`; the chain receipt/USDC transfer are **not independently verified** here. This file otherwise preserves the 24 October pre-submission test snapshot; its "Not proven or done" section refers to that earlier time. No organizer review or payout confirmed.


Node 24.19.0; ElizaOS core 1.7.2; x402 core/evm/fetch 2.28.0; viem 2.57.11. All are locked in package-lock.json. Original code is MIT and Codex-assisted.

## Observed checks

`npm run check`: **63 passed, 0 failed** after the final dependency overrides. `npm run smoke`: actual ElizaOS registration and processActions, actual x402 SDK and synthetic wallet, two mocked HTTP exchanges, zero real network calls/payments. These are implementation checks, not bounty-eligible paid evidence.

Coverage includes the real registered runtime action; rejection of non-operator messages even when the runtime skips validate; disabled default payment; one attempt/authorization; correct SDK EIP3009 payload and recovered signer; altered merchant/network/token/amount/lifetime/schema rejection; in-flight abort; owner decline; local origin/session/Host protection; occupied port; and absence of paid data/signatures from framework logs, memories, events, state and browser output. The adapter is an explicit single-action in-memory host, not a replacement for a full persistent ElizaOS database adapter.

A read-only independent review checked the actual installed AgentRuntime code, callback/result privacy paths, handler-side guards, attempt races, private sink cleanup and owner wallet helper. The review's cancellation finding was addressed with an AbortController and a passing in-flight abort check. Sandbox loopback EACCES was distinguished from a functional failure; the full suite ran with legitimate local-loopback access.

## Dependency audit

The final observed npm audit reports **0 high, 0 moderate, 0 critical and 5 low** findings (five package entries from one elliptic advisory chain), not a clean/zero-advisory tree.

- `@ungap/structured-clone` is pinned to 1.3.1 instead of the deprecated 1.2.0 transitive version.
- `@elizaos/core` is scoped to `pdfjs-dist` 5.4.149, within its declared major 5 range and below the affected regression range 5.6.83–6.2.107. This avoids that range; it is not a claim that 5.4.149 is the later 6.2.108 patch.
- x402 core/evm are explicitly scoped to Zod 4.6.7. This crosses their declared `^3.24.2` major constraint. Installed 4.6.7 restores the SDK's one-argument record compatibility. Four tests exercise the actual public x402 schema exports, records, real SDK payload and invalid inputs; the full documented v2 exact path also passes. This is not broad upstream support or proof that every unused SDK export works with this override.
- Elliptic through ElizaOS crypto-browserify remains installed with an advisory and no patched version identified. Our payment signatures use the x402/viem signer path; the plugin does not call elliptic signing/key APIs. No universal claim of dependency-path unreachability is made.

Primary advisory records: [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [PDF.js](https://github.com/advisories/GHSA-hq66-cqwq-w95j), [elliptic](https://github.com/advisories/GHSA-848j-6mx2-7j84). Registry metadata still identifies x402 core 2.28.0 with its original Zod 3 constraint. Do not use `npm audit fix --force` to silently replace the framework/SDK.

## Not proven or done

No real paid call, independently verified live settlement, public repository, claim email, available framework slot, accepted claim or award receipt. API terms/purchase and publications still require the operator's specific approval, and final financial signing remains in their wallet. The proposed API purchase is at most 0.01 USDC; no bridge or top-up is included.

The bounty allows at most two framework payouts per builder. Sharing our own guarded transport code is not prohibited in the inspected text; whether a specific implementation passes is the organizer's decision. We plan a distinct real call through each claimed framework, rather than recycling one transaction across claims. That is the conservative proof plan, not an explicit published hash-uniqueness rule. Payment is promised within three days after passing, with no review deadline; October receipt is unconfirmed.
