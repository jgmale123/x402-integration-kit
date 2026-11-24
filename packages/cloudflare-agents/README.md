# Blockchain IQ x402 on Cloudflare Agents

A Cloudflare Agent (Durable Object) that pays for and fetches Blockchain IQ x402 resources, with strict payment guards. Community code, credited in NOTICE.md and provided as is.

| Route | What it does | Cost |
| --- | --- | --- |
| `GET /catalog` | The live list of resources, with prices and parameters | Free |
| `POST /resource` | Any resource in the catalogue, by id | The resource's catalogue price, within your limits |
| `GET /ledger` | Your limits, what is reserved against them, and the record of every payment attempt | Free |
| `POST /event-risk` | The event-risk resource only (the original route) | $0.05 |

## Any catalogue resource (version 0.2.0)

The catalogue is at `https://www.blockchainiq.co/api/x402/v1` and changes as products are added. On 11/24/2026 it listed 49 resources: 6 free and 43 paid, from $0.01 to $19.00 a call.

`POST /resource` takes `{ "resource": "<id>", "params": { ... }, "confirmPayment": true }`. The body can name a catalogue resource and its listed parameters, and nothing else; the URL is built in code on the fixed Blockchain IQ origin. A free resource needs no `confirmPayment`. Limits are Worker variables that only the owner can set:

| Variable | Meaning | Default |
| --- | --- | --- |
| `MAX_PRICE_PER_CALL_USD` | Most one call may cost. A resource priced above it is refused (HTTP 403) before any request to it. | `0.05` |
| `MAX_PAYMENTS` | Most payments the Worker will ever sign on this route | `1` |
| `MAX_TOTAL_USD` | Most the Worker will ever spend on this route | per-call limit x payments |

No setting can raise one call above $25.00. The wallet never signs more than the catalogue price: a server quote above it is refused. Each payment is reserved in the Durable Object ledger before anything is signed and is never refunded automatically; when the limits are used up the route answers HTTP 409. The live quote carries one option per rail (Base and Solana); only the Base option, to the pinned payee in USDC, is ever signed. This route uses `PROJECT_EVM_PRIVATE_KEY` only (a protected authorization is bound to event-risk).

One command, no server to start (it runs the Worker in the local workerd runtime, makes one request and exits):

```
npm run resource                              # free: every resource and price
npm run resource -- sample                    # free resource
npm run resource -- brief                     # shows the price; nothing is signed without --pay
npm run resource -- brief --pay               # one paid call; key from PROJECT_EVM_PRIVATE_KEY
npm run resource -- network chain=base --pay
```

That local run starts with an empty ledger each time; a deployed Worker keeps its ledger. With `npm start` (below), call it as `curl -X POST http://127.0.0.1:8787/resource -H "Authorization: Bearer $INVOCATION_TOKEN" -H "Content-Type: application/json" -d '{"resource":"brief","confirmPayment":true}'`; `npm start` passes the three limit variables through when they are set in your shell.

## The event-risk route

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
