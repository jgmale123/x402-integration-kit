# Test run

Run on Sun 1 Nov 2026, about 2:05 AM Central, Windows 11, Python 3.14.8, in a fresh virtual environment created inside this folder (`.venv`, git-ignored). No call was made to blockchainiq.co; all HTTP responses are mocked.

```
python -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[test]"
.venv\Scripts\python.exe -I -m pytest -v -p no:cacheprovider
```

Real output (paths shortened, deprecation-warning detail lines omitted):

```
============================= test session starts =============================
platform win32 -- Python 3.14.8, pytest-9.2.0, pluggy-1.7.0
configfile: pyproject.toml
plugins: anyio-4.15.1, langsmith-0.14.16
collected 22 items

tests/live/test_free_live.py::test_catalog_lists_brief_and_event_risk SKIPPED [  4%]
tests/live/test_free_live.py::test_quote_reads_402_without_paying SKIPPED [  9%]
tests/live/test_free_live.py::test_tools_have_schemas SKIPPED (live ...) [ 13%]
tests/live/test_free_live.py::test_paid_call_needs_key SKIPPED (live...) [ 18%]
tests/test_offline.py::test_quote_success_reads_402_price PASSED         [ 22%]
tests/test_offline.py::test_quote_picks_cheapest_base_option_and_ignores_other_networks PASSED [ 27%]
tests/test_offline.py::test_quote_non_402_raises PASSED                  [ 31%]
tests/test_offline.py::test_quote_missing_header_raises PASSED           [ 36%]
tests/test_offline.py::test_quote_no_base_option_raises PASSED           [ 40%]
tests/test_offline.py::test_quote_malformed_header_raises_clean_error PASSED [ 45%]
tests/test_offline.py::test_brief_success_returns_body_and_settlement PASSED [ 50%]
tests/test_offline.py::test_event_risk_sends_params_to_event_risk_path PASSED [ 54%]
tests/test_offline.py::test_brief_tool_output_includes_payment_proof PASSED [ 59%]
tests/test_offline.py::test_event_risk_tool_passes_args PASSED           [ 63%]
tests/test_offline.py::test_paid_call_still_402_raises PASSED            [ 68%]
tests/test_offline.py::test_http_error_raises_with_status PASSED         [ 72%]
tests/test_offline.py::test_malformed_non_json_error_body_raises_clean_error PASSED [ 77%]
tests/test_offline.py::test_malformed_non_json_success_body_falls_back_to_raw PASSED [ 81%]
tests/test_offline.py::test_paid_call_needs_key PASSED                   [ 86%]
tests/test_offline.py::test_default_cap_is_five_cents_and_atomic_conversion PASSED [ 90%]
tests/test_offline.py::test_tools_have_expected_names_and_schemas PASSED [ 95%]
tests/test_offline.py::test_catalog_tool_formats_rows PASSED             [100%]

================= 18 passed, 4 skipped, 13 warnings in 5.38s ==================
```

After the `pyproject.toml` version pins were added and the package reinstalled, the suite was run again: `18 passed, 4 skipped, 13 warnings in 1.72s`.

## What is not covered
- The real x402 signing path (`x402ClientSync`, `register_exact_evm_client`, `wrapRequestsWithPayment`) is not exercised: tests replace the paying session with a fake. Signing was not run because it needs a wallet key and a paid call, which were out of scope.
- The 4 skipped live tests and `examples/agent.py` (needs a model API key) were not run.
