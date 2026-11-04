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
