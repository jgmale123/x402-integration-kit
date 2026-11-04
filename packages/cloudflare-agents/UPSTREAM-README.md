# Blockchain IQ event-risk with Cloudflare Agents

A Cloudflare Agent that buys the fixed event-risk resource through x402 v2 for exactly **0.050000 native USDC on Base**. The default resource returns seven days of scheduled economic and crypto events. The relayer supplies network gas. This continues the Genesis project's existing Cloudflare candidate; LangChain is its other candidate.

## Run locally

Requires Node 24. Run `npm ci --ignore-scripts`, then `npm run check` for TypeScript, unit tests and actual local Miniflare Agent tests. Tests make no paid request.

Run `node node_modules/wrangler/bin/wrangler.js dev --local --ip 127.0.0.1` for a local Worker. No Cloudflare deployment or paid account is required. Configure private bindings in an ignored .dev.vars file or local runtime secret bindings:

- INVOCATION_TOKEN: a fresh random string of at least 32 characters, required by every route.
- Exactly one payment source: PROJECT_EVM_PRIVATE_KEY for a dedicated throwaway Base wallet, or PROJECT_PAYMENT_AUTHORIZATION for an original protected authorization. Keep both private.
- The protected path also needs separately trusted PROJECT_OPERATION_ID, PROJECT_INTENT_HASH and PROJECT_PAYER_ADDRESS. The original envelope contains id, hash, state, domain, types, authorization and signature.

Send an authenticated POST /event-risk with JSON `{"confirmPayment":true}` and an Authorization bearer header using INVOCATION_TOKEN. Read retained evidence with authenticated GET /receipt; /health shows whether the operation is unused. The singleton persists an operation before network activity and refuses another invocation, including after missing receipts or interruption. Preserve state and reconcile the original payment before recovery.

The request is fixed to GET https://www.blockchainiq.co/api/x402/v1/event-risk with no caller-selected parameters. Challenge selection, SDK spend controls and the actual EIP-712 request pin Base 8453, native USDC, the observed provider recipient and 50,000 atoms. Redirects, changed terms and multiple paid dispatches are refused. Receipts are provider-reported; verify the transaction independently before accounting for settlement.

## Clock and protected authorizations

EIP-3009 validity follows chain time. Compare current Base block timestamps from two independent RPC providers before a protected call. If the host differs, configure PROJECT_CHAIN_CLOCK_OFFSET_SECONDS as checked chain time minus host Unix seconds immediately before invocation. Only integer offsets within +/-300 seconds are accepted. The default is zero for synchronized hosts. This adjusts validation only; signed amount, domain, destination, validity and nonce remain unchanged. The capability must already be valid, with 6-300 chain seconds remaining. Keep unused capabilities private.

Tests cover calibrated clock rejection, actual SDK payload preservation, concurrent duplicate refusal, retained Agent state, missing receipts, lost responses and redirects. Test identities and receipts are synthetic.

SOURCE_ORIGIN.json records the original Genesis Agent-05 Cloudflare source. Agent-24 adapted the resource/price and added calibrated validation. The original rejected brief proposal remains unchanged and was never authorized or executed. Event-risk is a separate product purchase accepted by the published bounty. An award depends on buyer review; a submitted claim is not earnings.

Sources: [bounty terms](https://www.blockchainiq.co/blog/x402-build-bounties), [catalogue](https://www.blockchainiq.co/agents), [Cloudflare Agents API](https://developers.cloudflare.com/agents/runtime/agents-api/).

## Live validation

A real paid call through this Agent returned HTTP 200 for transaction [0x29a7f07c94e6089fdd80f54ffb5412f217bbf621233d4933a2a7425d5fb1e33c](https://basescan.org/tx/0x29a7f07c94e6089fdd80f54ffb5412f217bbf621233d4933a2a7425d5fb1e33c). Two independent Base RPCs verified the exact 0.050000 USDC transfer and original nonce consumption; finality was pending at the observation. See LIVE_PAYMENT.json and VALIDATION.md. The bounty claim is submitted for buyer review; an award is not yet received.
