# Validation

On 25 October 2026, Node.js 24.19.0 installed the pinned graph with `npm ci --ignore-scripts --no-audit --no-fund` (220 packages). TypeScript checking and all **17 tests** passed. The tests run the real Cloudflare Agent class in local Miniflare/workerd with mocked outbound HTTP and synthetic signers. No paid call or bounty acceptance is established by these tests.

Coverage includes the fixed event-risk URL and exact 50,000-atom invoice, refusal of the old brief invoice, actual SDK signing and protected payload creation, signed-field changes, clock skew, concurrent duplicate refusal, retained Durable Object state, failed/missing receipts and redirects. A protected clock case uses the real local Agent with a 120-second calibration while preserving the original nonce and signature.

This continues public Genesis Cloudflare source `adf87accfb0cd385297dc8b3889e602558d119b7`; provenance is in SOURCE_ORIGIN.json. The original brief candidate remains preserved. This adaptation selects the separate event-risk product allowed by the buyer's bounty, with a five-cent spend cap. An earlier brief proposal was rejected by the signer and was never authorized or executed; its invoice reference is unchanged.

Live execution and any competitive bounty award must be evidenced separately. No treasury private key, protected authorization signature, invocation token, private environment file or purchased data is included here.

## Live paid execution

The published Cloudflare Agent at commit 71060d9bb246ca2ea9f4d64af79bb97d86b300dd completed an actual event-risk call through local Miniflare/workerd and returned HTTP 200. Transaction: 0x29a7f07c94e6089fdd80f54ffb5412f217bbf621233d4933a2a7425d5fb1e33c. Exact native Base USDC API expense: 0.050000; the provider/relayer supplied gas. Two independent Base RPC endpoints agree on the successful canonical receipt, exact transfer and original authorization nonce consumption. Finality remained pending at the dated observation in LIVE_PAYMENT.json. The first full Cloudflare claim has been submitted; no award or revenue is claimed. These documentation additions do not change the 17-test application source.
