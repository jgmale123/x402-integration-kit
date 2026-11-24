# Test results

## Version 0.2.0, run 11/24/2026 7:53 AM Central

Windows 11, Python 3.12.10, x402 SDK 2.29.0, fresh virtual environment (`pip install -e ".[test]"`). Command, run in this folder:

```
.venv\Scripts\python.exe -I -m pytest -v -p no:cacheprovider
```

Result: 46 passed, 4 skipped (18 earlier offline tests unchanged, 28 added in `tests/test_catalog.py`; the 4 skipped are the live tests that need `BIQ_LIVE_TESTS=1`). The tests make no request to blockchainiq.co and use no real key.

### Live checks (free, nothing signed), 11/24/2026

1. `python examples/quote_all.py` asked the live API for the price of all 43 paid resources: 40 quotes equaled the catalogue price, 0 differed, 3 gave no quote because the script sent placeholder parameters (`dashboard-section`, `network`: HTTP 404; `x402-seller-history`: HTTP 400).

### Real paid call

One real paid call was made on 11/24/2026 7:53 AM Central: resource `brief`, 0.01 USDC on Base, command `BIQ_MAX_USDC_PER_CALL=0.01 python examples/get_resource.py brief --pay`, HTTP 200, payer `0x59400C7697bEaa913c3d7F0bD11D3F8c76718C1e`, transaction [`0xd18f949720f854835b186a0cdea61017a8e82900ff5dad795c2ee631f6daffe0`](https://basescan.org/tx/0xd18f949720f854835b186a0cdea61017a8e82900ff5dad795c2ee631f6daffe0).

### Real output

```
============================= test session starts =============================
platform win32 -- Python 3.12.10, pytest-9.2.0, pluggy-1.7.0 -- .venv\Scripts\python.exe
rootdir: C:\dev\x402-integration-kit\packages\langchain-python
configfile: pyproject.toml
plugins: anyio-4.16.0, langsmith-0.16.1
collecting ... collected 50 items

tests\live\test_free_live.py::test_catalog_lists_brief_and_event_risk SKIPPED [  2%]
tests\live\test_free_live.py::test_quote_reads_402_without_paying SKIPPED [  4%]
tests\live\test_free_live.py::test_tools_have_schemas SKIPPED [  6%]
tests\live\test_free_live.py::test_paid_call_needs_key SKIPPED [  8%]
tests\test_catalog.py::test_catalog_keeps_only_well_formed_get_entries PASSED [ 10%]
tests\test_catalog.py::test_urls_are_built_on_the_fixed_origin_from_listed_parameters_only PASSED [ 12%]
tests\test_catalog.py::test_two_rail_quote_is_accepted_and_the_solana_option_ignored PASSED [ 14%]
tests\test_catalog.py::test_changed_or_ambiguous_quotes_are_refused[accepts0] PASSED [ 16%]
tests\test_catalog.py::test_changed_or_ambiguous_quotes_are_refused[accepts1] PASSED [ 18%]
tests\test_catalog.py::test_changed_or_ambiguous_quotes_are_refused[accepts2] PASSED [ 20%]
tests\test_catalog.py::test_changed_or_ambiguous_quotes_are_refused[accepts3] PASSED [ 22%]
tests\test_catalog.py::test_changed_or_ambiguous_quotes_are_refused[accepts4] PASSED [ 24%]
tests\test_catalog.py::test_changed_or_ambiguous_quotes_are_refused[accepts5] PASSED [ 26%]
tests\test_catalog.py::test_changed_or_ambiguous_quotes_are_refused[accepts6] PASSED [ 28%]
tests\test_catalog.py::test_changed_or_ambiguous_quotes_are_refused[accepts7] PASSED [ 30%]
tests\test_catalog.py::test_changed_or_ambiguous_quotes_are_refused[accepts8] PASSED [ 32%]
tests\test_catalog.py::test_changed_or_ambiguous_quotes_are_refused[accepts9] PASSED [ 34%]
tests\test_catalog.py::test_changed_or_ambiguous_quotes_are_refused[accepts10] PASSED [ 36%]
tests\test_catalog.py::test_quote_for_another_url_or_a_malformed_header_is_refused PASSED [ 38%]
tests\test_catalog.py::test_free_resource_is_read_without_a_wallet_or_the_budget PASSED [ 40%]
tests\test_catalog.py::test_paid_resource_is_bought_once_and_the_default_single_payment_is_then_used_up PASSED [ 42%]
tests\test_catalog.py::test_price_above_the_per_call_limit_is_refused_before_any_request_to_the_resource PASSED [ 44%]
tests\test_catalog.py::test_owner_limits_allow_a_dearer_resource_and_the_total_stops_the_next_payment PASSED [ 46%]
tests\test_catalog.py::test_no_setting_raises_one_call_above_25_dollars PASSED [ 48%]
tests\test_catalog.py::test_server_quote_above_the_limit_is_never_signed PASSED [ 50%]
tests\test_catalog.py::test_unknown_ids_and_bad_parameters_are_refused_with_no_payment PASSED [ 52%]
tests\test_catalog.py::test_failed_or_unconfirmed_paid_responses_raise_and_keep_the_reservation PASSED [ 54%]
tests\test_catalog.py::test_paid_get_needs_a_key PASSED [ 56%]
tests\test_catalog.py::test_quote_resource_reports_the_server_price_and_signs_nothing PASSED [ 58%]
tests\test_catalog.py::test_catalog_tools_list_and_get PASSED [ 60%]
tests\test_catalog.py::test_pinned_policy_lets_one_exact_base_payment_through_once PASSED [ 62%]
tests\test_catalog.py::test_real_sdk_signs_exactly_the_quoted_amount_to_the_pinned_payee PASSED [ 64%]
tests\test_offline.py::test_quote_success_reads_402_price PASSED [ 66%]
tests\test_offline.py::test_quote_picks_cheapest_base_option_and_ignores_other_networks PASSED [ 68%]
tests\test_offline.py::test_quote_non_402_raises PASSED [ 70%]
tests\test_offline.py::test_quote_missing_header_raises PASSED [ 72%]
tests\test_offline.py::test_quote_no_base_option_raises PASSED [ 74%]
tests\test_offline.py::test_quote_malformed_header_raises_clean_error PASSED [ 76%]
tests\test_offline.py::test_brief_success_returns_body_and_settlement PASSED [ 78%]
tests\test_offline.py::test_event_risk_sends_params_to_event_risk_path PASSED [ 80%]
tests\test_offline.py::test_brief_tool_output_includes_payment_proof PASSED [ 82%]
tests\test_offline.py::test_event_risk_tool_passes_args PASSED [ 84%]
tests\test_offline.py::test_paid_call_still_402_raises PASSED [ 86%]
tests\test_offline.py::test_http_error_raises_with_status PASSED [ 88%]
tests\test_offline.py::test_malformed_non_json_error_body_raises_clean_error PASSED [ 90%]
tests\test_offline.py::test_malformed_non_json_success_body_falls_back_to_raw PASSED [ 92%]
tests\test_offline.py::test_paid_call_needs_key PASSED [ 94%]
tests\test_offline.py::test_default_cap_is_five_cents_and_atomic_conversion PASSED [ 96%]
tests\test_offline.py::test_tools_have_expected_names_and_schemas PASSED [ 98%]
tests\test_offline.py::test_catalog_tool_formats_rows PASSED [100%]

======================== 46 passed, 4 skipped in 2.88s ========================
```

<!-- earlier runs below -->

# Earlier runs (kept as recorded)

## Earlier runs (kept as recorded)

## Test run

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
