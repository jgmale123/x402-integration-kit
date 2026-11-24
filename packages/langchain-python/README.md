# Blockchain IQ x402 Integration Kit: LangChain (Python)

LangChain tools for [Blockchain IQ](https://www.blockchainiq.co/agents)'s pay-per-call crypto data API. The agent pays per request in USDC on Base over [x402](https://www.x402.org). There is no account and no API key: a wallet holding a few cents of USDC is the only credential.

Originally written by ScrapeMole for Blockchain IQ's x402 build bounty and included in the Integration Kit with credit (see `NOTICE.md`). MIT licensed. Changes from the original are in `CHANGES.md`.

## Endpoints used (from `langchain_blockchainiq/client.py` and `tools.py`)

Base URL `https://www.blockchainiq.co/api/x402/v1`, network `eip155:8453` (Base mainnet), asset USDC.

| Tool | Resource | Price | Returns |
| --- | --- | --- | --- |
| `blockchainiq_market_brief` | `GET /brief` | $0.01 | BTC, ETH, SOL, XRP prices with moves, events in the next 48h, risk flags |
| `blockchainiq_event_risk` | `GET /event-risk?days=&minImportance=` | $0.05 | Scheduled data releases, central-bank decisions, auctions, crypto and regulatory milestones (1-90 days) |
| `blockchainiq_catalog` | `GET /` | free | Every resource with its price |

The prices above are stated in the tool descriptions in the code; the live price is whatever the API quotes in its 402 response.

## Any catalogue resource (version 0.2.0)

The catalogue changes as products are added. On 11/24/2026 it listed 49 resources: 6 free and 43 paid, from $0.01 to $19.00 a call. `get_blockchainiq_catalog_tools(client)` returns two tools over all of it:

| Tool | What it reads | Cost |
| --- | --- | --- |
| `blockchainiq_catalog` | The live list of resources, with prices and parameters | Free |
| `blockchainiq_get` (`resource`, optional `params`) | Any resource in the catalogue, by id | The resource's catalogue price, within your limits |

In code, `client.get("research", {"coin": "bitcoin"})` does the same; `client.list_resources()` and `client.quote_resource(id, params)` are free. Arguments can name a catalogue resource and its listed parameters, and nothing else: the URL is built in code on the fixed Blockchain IQ origin.

| Client option | Meaning | Default |
| --- | --- | --- |
| `max_usdc_per_call` | Most one call may cost. A resource priced above it is refused before any request to it. | `"0.05"` |
| `max_payments` | Most payments `get()` will ever sign on one client | `1` |
| `max_total_usdc` | Most `get()` will ever spend on one client | per-call limit x payments |

No setting can raise one `get()` call above $25.00. Before paying, `get()` reads the unpaid quote and checks it: the exact URL, exactly one option on Base, USDC, the pinned Blockchain IQ payee, and a price within your limit. The live quote carries one option per rail (Base and Solana); only the Base option is ever signed, and one `get()` can sign once only. The receipt must name a Base transaction and your own wallet as payer. `brief()` and `event_risk()` are unchanged: they are capped per call only and are not counted against `max_payments`.

```bash
python examples/get_resource.py                         # free: every resource and price
python examples/get_resource.py research coin=bitcoin   # free: the server's price, nothing signed
python examples/get_resource.py research coin=bitcoin --pay   # one paid call; key from AGENT_PRIVATE_KEY
python examples/quote_all.py                            # free: compare every live quote with the catalogue
```

`get_resource.py` reads its limits from `BIQ_MAX_USDC_PER_CALL` (default `0.05`), `BIQ_MAX_PAYMENTS` and `BIQ_MAX_TOTAL_USDC`.

## Install

From this folder, using Python 3.10 or newer:

```bash
python -m venv .venv
. .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[test]"
```

Exact tested dependency versions are in `requirements-lock.txt`.

## One paid call ($0.01)

Set the wallet key in your own shell (a dedicated Base wallet holding at least $0.01 USDC; no ETH needed). The code reads it from the `AGENT_PRIVATE_KEY` environment variable, uses it only to sign locally, and never prints it.

```bash
export AGENT_PRIVATE_KEY=...    # set this yourself; do not paste a key into files or chat
python examples/paid_call.py
```

The example reads the free quote first, refuses anything above $0.01, makes one paid `brief` call, and prints prices, the payer address and the settlement transaction link.

## Use in an agent

```python
from langchain.agents import create_agent
from langchain_blockchainiq import BlockchainIQClient, get_blockchainiq_tools

tools = get_blockchainiq_tools(BlockchainIQClient(max_usdc_per_call="0.05"))
agent = create_agent("openai:gpt-4.1-mini", tools=tools)
```

See `examples/agent.py` (needs a model API key in addition to the wallet). Each tool is a normal LangChain `BaseTool`. Paid tools return JSON with `data` plus a `payment` object (`transaction`, `network`, `payer`).

## Spend safety

- `max_usdc_per_call` (default `0.05`) is enforced as an x402 payment policy and as SDK spend controls; a dearer quote is refused before anything is signed.
- `client.quote(path)` reads the price from the unpaid 402 for free.
- Use a dedicated wallet with a small balance, never a main wallet.

## Tests (offline, no wallet, no network)

```bash
python -m pytest -q     # 46 offline tests with mocked responses; 4 live tests are skipped
```

See `TESTS.md` for the recorded run.

## As is, no maintenance promise

This code is provided as is, without warranty. Blockchain IQ does not promise maintenance, updates or support for it; it may change or be withdrawn without notice. Test with a small balance before relying on it. Market data, not investment advice.
