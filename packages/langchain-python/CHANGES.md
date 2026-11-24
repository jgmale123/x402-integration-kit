# Changes from the reviewed source (commit 6105d10)

1. **`langchain_blockchainiq/client.py`, `BlockchainIQClient.quote()`**: decoding the `PAYMENT-REQUIRED` header is now wrapped so a malformed header (bad base64, bad JSON, missing `amount`, wrong shape) raises `BlockchainIQError("malformed PAYMENT-REQUIRED header: ...")` instead of leaking a raw `binascii`/`JSONDecodeError`/`KeyError`. Justification: the method already documents `BlockchainIQError` for bad quotes; the other three failure branches raise it. Success behavior is unchanged. Covered by `test_quote_malformed_header_raises_clean_error`.
2. **`pyproject.toml`**: dependency ranges tightened to versions installed and tested in a fresh virtual environment on 1 Nov 2026 (Python 3.14.8): `langchain-core>=1.7.3,<2`, `x402[evm]>=2.26.0,<3`, `eth-account>=0.14.0,<1`, `requests>=2.34.2,<3`, `pytest>=9.2.0,<10`. Lower versions were not tested. Previously `langchain-core`, `eth-account` and `requests` had no upper bound.
3. **`requirements-lock.txt`** added: the exact `pip freeze` of the tested environment (69 lines, no editable install).
4. **Tests**: the upstream `tests/test_free.py` needed live network access to blockchainiq.co. It is kept unchanged in behavior as `tests/live/test_free_live.py` but skipped unless `BIQ_LIVE_TESTS=1`. New `tests/test_offline.py` (18 tests, mocked responses) is the default suite.
5. **`README.md`** rewritten for the kit (install, offline tests, as-is statement). Endpoints, prices and payment description are as in the source code.
6. **`NOTICE.md`, `CHANGES.md`, `TESTS.md`** added.

No other source file (`tools.py`, `__init__.py`, `examples/*.py`) was changed. `LICENSE` is byte-identical to the source.

## Observations, not changed
- `client.py` sends `User-Agent: langchain-blockchainiq/0.1.0 (+https://scrapemole.pages.dev)` on every request (author attribution). Left as is.
- Package metadata (`description`, `authors`, `Homepage`) still names ScrapeMole.
- `README`/`__init__` upstream state "Not affiliated with Blockchain IQ". Kept in `__init__.py` unchanged; the kit README states the kit relationship.

## Version 0.2.0 (11/24/2026): every catalogue resource

These changes do alter source files. Each is marked in the code with "Added by Blockchain IQ".

1. `langchain_blockchainiq/catalog.py` (new). Why: to offer every resource, not only the brief and event risk. Reads the free catalogue and builds one URL on the fixed origin from a resource id and its listed parameters.
2. `langchain_blockchainiq/client.py`. Added `get()`, `resources()`, `list_resources()`, `quote_resource()`, `limits()`, `budget()` and the options `max_payments` and `max_total_usdc`. `get()` checks the unpaid quote itself (exact URL, exactly one Base option, USDC, pinned payee, price within the limit) before the SDK is allowed to sign, uses an SDK policy that lets one payment of exactly the quoted amount through once, sets the SDK spend cap to that amount (the SDK otherwise refuses payments above 1 USD), refuses redirects, and checks the receipt. `brief()`, `event_risk()`, `quote()` and `catalog()` are unchanged.
3. `langchain_blockchainiq/tools.py`, `__init__.py`. Added `BlockchainIQResourceListTool`, `BlockchainIQGetTool` and `get_blockchainiq_catalog_tools()`. `get_blockchainiq_tools()` still returns the original three tools.
4. `tests/test_catalog.py` (new, 28 tests), including one that runs the real x402 SDK signing path offline with a throwaway key. The 18 earlier tests are unchanged and still pass.
5. `examples/get_resource.py`, `examples/quote_all.py` (new).
6. `README.md`, `TESTS.md`, `pyproject.toml` (version 0.2.0).

Not changed: `requirements-lock.txt` still records the 11/01/2026 environment (x402 2.26.0). The 11/24/2026 run used Python 3.12.10 and x402 2.29.0, inside the ranges in `pyproject.toml`.

Observation: the original quote path already ignored non-Base options, and the paying path registered Base only, so the two-rail change that broke the LangChain.js, ElizaOS and Cloudflare packages was not seen to break this one. Not verified with a paid call.
