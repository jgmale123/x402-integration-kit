# Blockchain IQ x402 on Cloudflare Agents

A Cloudflare Agent (Durable Object) that pays for and fetches one Blockchain IQ x402 resource, with strict payment guards. Community code, credited in NOTICE.md and provided as is.

## What it does

`POST /event-risk` makes one `GET https://www.blockchainiq.co/api/x402/v1/event-risk` through the x402 v2 client. That endpoint costs **0.05 USDC (50,000 atoms) on Base** per call and returns seven days of scheduled economic and crypto events. The code calls **event-risk only**. It does not call the `brief` endpoint (`/api/x402/v1/brief`, 0.01 USDC).

Guards in the code: the URL, GET method, network (Base, 8453), USDC contract, recipient and exact amount are pinned in the challenge, in the SDK spend controls and in the signed EIP-712 request; redirects are refused; at most one unpaid and one paid request are sent; and one paid operation is allowed per Durable Object state. The wallet only signs; the relayer pays gas.

## Install

Requires Node 24.

```
npm ci --ignore-scripts
npm run check
```

`npm run check` type-checks and runs the offline tests. It makes no network call to blockchainiq.co and spends nothing.

## Run (spends 0.05 USDC per real call)

Use a dedicated throwaway Base wallet holding at least 0.05 USDC. Set the two variables in your own shell; never write the key into a file you commit.

PowerShell:

```
$env:PROJECT_EVM_PRIVATE_KEY = "<0x key of the throwaway wallet>"
$env:INVOCATION_TOKEN = "<random string, at least 32 characters>"
npm start
```

bash:

```
export PROJECT_EVM_PRIVATE_KEY=<0x key of the throwaway wallet>
export INVOCATION_TOKEN=<random string, at least 32 characters>
npm start
```

`npm start` runs `scripts/run-local.mjs`, which writes the git-ignored `.dev.vars` file from those variables and starts `wrangler dev --local` on http://127.0.0.1:8787. It prints neither value. Then call it (this is the paid call):

```
curl -X POST http://127.0.0.1:8787/event-risk -H "Authorization: Bearer $INVOCATION_TOKEN" -H "Content-Type: application/json" -d '{"confirmPayment":true}'
```

`GET /health` and `GET /receipt` (same bearer header) show whether the single operation is unused and the retained evidence. A second `POST /event-risk` returns 409. The receipt is provider-reported; verify the transaction on-chain before accounting for it. `.dev.vars` holds your key in plain text on disk: delete it when you finish.

The author's alternative payment source (a pre-signed protected authorization) and clock calibration are described in `UPSTREAM-README.md`.

## Tests

See TESTS.md for the command and real output. Changes from the source are in CHANGES.md.

## As is, and maintenance

This package is community code provided as is, with no warranty (see LICENSE). Blockchain IQ has reviewed it statically and has not committed to maintain it, fix issues or keep it compatible with changes to the API, the x402 specification or the pinned dependencies. Pricing and behavior of the live API can change; check the live x402 challenge before relying on the pinned amount, which the code refuses to exceed.
