"""Added by Blockchain IQ. Offline tests for the any-resource path: no network, nothing paid.

Every HTTP response is a fixture. The wallet key used by the signing test is
generated in memory and never printed. Run: python -m pytest -q
"""

import base64
import io
import json

import pytest
import requests
from eth_account import Account
from requests.adapters import HTTPAdapter
from urllib3.response import HTTPResponse

from langchain_blockchainiq import BlockchainIQClient, get_blockchainiq_catalog_tools
from langchain_blockchainiq.catalog import CATALOG_URL, CatalogError, build_url, list_resources, parse_catalog
from langchain_blockchainiq.client import (
    BASE_MAINNET,
    PAY_TO,
    USDC_BASE,
    BlockchainIQError,
    pinned_policy,
    validate_challenge,
)

TX = "0x" + "cd" * 32
TERMS = "https://www.blockchainiq.co/terms"


def entry(rid, path, price, properties=None, method="GET"):
    e = {"id": rid, "method": method, "path": path, "price": price, "title": rid, "description": f"about {rid}"}
    if properties:
        e["discovery"] = {"inputSchema": {"properties": properties}}
    return e


CATALOG = {"source": "Blockchain IQ", "terms": TERMS, "data": [
    entry("catalog", "/api/x402/v1", "free"),
    entry("sample", "/api/x402/v1/sample", "free"),
    entry("brief", "/api/x402/v1/brief", "$0.01"),
    entry("calendar", "/api/x402/v1/calendar", "$0.03"),
    entry("event-risk", "/api/x402/v1/event-risk", "$0.05", {"days": {}, "minImportance": {}}),
    entry("network", "/api/x402/v1/network/{chain}", "$0.03"),
    entry("analyst-pack", "/api/x402/v1/analyst-pack", "$2.00"),
    entry("poster", "/api/x402/v1/poster", "$0.01", method="POST"),
    entry("elsewhere", "/other/path", "$0.01"),
    entry("odd-price", "/api/x402/v1/odd", "0.01"),
]}
PRICES = {f"https://www.blockchainiq.co{e['path']}": e["price"] for e in CATALOG["data"]}


def b64(obj) -> str:
    return base64.b64encode(json.dumps(obj).encode()).decode()


def base_option(amount, **patch):
    return {"scheme": "exact", "network": BASE_MAINNET, "amount": str(amount), "asset": USDC_BASE, "payTo": PAY_TO,
            "maxTimeoutSeconds": 300, "extra": {"name": "USD Coin", "version": "2"}, **patch}


def solana_option(amount):
    return {"scheme": "exact", "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", "amount": str(amount),
            "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "payTo": "So1anaPayee", "maxTimeoutSeconds": 300,
            "extra": {"feePayer": "So1anaFeePayer"}}


def quote_header(url, accepts):
    return b64({"x402Version": 2, "resource": {"url": url}, "accepts": accepts})


def atomic_for(url):
    price = PRICES.get(url.split("?")[0], "$0.03")
    return int(round(float(price[1:]) * 1_000_000))


class Reply:
    def __init__(self, status=200, body=None, headers=None):
        self.status_code, self._body, self.headers = status, body, headers or {}

    def json(self):
        if self._body is None:
            raise ValueError("not json")
        return self._body


class Server:
    """Stands in for both sessions; records every URL asked for."""

    def __init__(self, accepts=None, payer="0x" + "11" * 20, paid_status=200, receipt=None, paid_body="envelope"):
        self.seen, self.paid = [], []
        self.accepts, self.payer, self.paid_status, self.receipt, self.paid_body = accepts, payer, paid_status, receipt, paid_body

    def get(self, url, params=None, timeout=None, allow_redirects=True):
        assert params is None and allow_redirects is False
        self.seen.append(url)
        if url == CATALOG_URL:
            return Reply(200, CATALOG)
        if url == f"{CATALOG_URL}/sample":
            return Reply(200, {"source": "Blockchain IQ", "terms": TERMS, "data": {"sample": True}})
        accepts = self.accepts(url) if self.accepts else [base_option(atomic_for(url)), solana_option(atomic_for(url))]
        return Reply(402, {}, {"payment-required": quote_header(url, accepts)})

    def paid_get(self, url, timeout=None, allow_redirects=True):
        assert allow_redirects is False
        self.paid.append(url)
        receipt = self.receipt or {"success": True, "transaction": TX, "network": BASE_MAINNET, "payer": self.payer}
        body = {"source": "Blockchain IQ", "terms": TERMS, "data": {"paid": url}} if self.paid_body == "envelope" else self.paid_body
        return Reply(self.paid_status, body, {"payment-response": b64(receipt)})


class PaidSession:
    def __init__(self, server):
        self.server = server

    def get(self, url, timeout=None, allow_redirects=True):
        return self.server.paid_get(url, timeout, allow_redirects)


def client_with(server, **options):
    c = BlockchainIQClient(private_key="unused-offline", **options)
    c._free_session = server
    c.signed_amounts = []

    def session(amount):
        c.signed_amounts.append(amount)
        return PaidSession(server), server.payer

    c._resource_session = session
    return c


# ---- catalogue and URL building ------------------------------------------
def test_catalog_keeps_only_well_formed_get_entries():
    resources = parse_catalog(CATALOG)
    assert list(resources) == ["catalog", "sample", "brief", "calendar", "event-risk", "network", "analyst-pack"]
    assert resources["analyst-pack"].price_atomic == 2_000_000 and resources["sample"].price_atomic == 0
    rows = list_resources(resources)
    assert all(r["resource"] != "catalog" for r in rows)
    assert next(r for r in rows if r["resource"] == "network")["requiredParams"] == ["chain"]
    assert next(r for r in rows if r["resource"] == "event-risk")["optionalParams"] == ["days", "minImportance"]
    for bad in (None, {"source": "Someone else", "terms": TERMS, "data": CATALOG["data"]}, {**CATALOG, "data": []}):
        with pytest.raises(CatalogError):
            parse_catalog(bad)


def test_urls_are_built_on_the_fixed_origin_from_listed_parameters_only():
    resources = parse_catalog(CATALOG)
    assert build_url(resources["network"], {"chain": "base"}) == f"{CATALOG_URL}/network/base"
    assert build_url(resources["event-risk"], {"days": 7, "minImportance": 2}) == f"{CATALOG_URL}/event-risk?days=7&minImportance=2"
    assert build_url(resources["brief"]) == f"{CATALOG_URL}/brief"
    for params in ({}, {"chain": "../brief"}, {"chain": "a/b"}, {"chain": "base", "x": "1"}, {"chain": 5}, {"chain": "a?b=c"}):
        with pytest.raises(CatalogError):
            build_url(resources["network"], params)
    for params in ({"url": "https://example.invalid"}, {"days": [1]}, {"days": ""}, {"days": "x" * 257}):
        with pytest.raises(CatalogError):
            build_url(resources["event-risk"], params)


# ---- the 402 quote ---------------------------------------------------------
def test_two_rail_quote_is_accepted_and_the_solana_option_ignored():
    url = f"{CATALOG_URL}/calendar"
    assert validate_challenge(quote_header(url, [base_option(30000), solana_option(30000)]), url, 30000) == 30000
    assert validate_challenge(quote_header(url, [solana_option(30000), base_option(20000)]), url, 30000) == 20000


@pytest.mark.parametrize("accepts", [
    [base_option(30001)],
    [base_option(30000), base_option(30000)],
    [solana_option(30000)],
    [base_option(30000, payTo="0x0000000000000000000000000000000000000001")],
    [base_option(30000, asset="0x0000000000000000000000000000000000000001")],
    [base_option(30000, scheme="upto")],
    [base_option(30000, maxTimeoutSeconds=301)],
    [base_option(30000, extra={"name": "USD Coin", "version": "2", "transferMode": "other"})],
    [base_option("0")],
    [base_option("3e4")],
    [],
])
def test_changed_or_ambiguous_quotes_are_refused(accepts):
    url = f"{CATALOG_URL}/calendar"
    with pytest.raises(BlockchainIQError, match="UNSAFE_PAYMENT_QUOTE"):
        validate_challenge(quote_header(url, accepts), url, 30000)


def test_quote_for_another_url_or_a_malformed_header_is_refused():
    url = f"{CATALOG_URL}/calendar"
    for header in (quote_header(f"{CATALOG_URL}/brief", [base_option(30000)]), "!!!", "", None, b64([1]), b64({"x402Version": 1})):
        with pytest.raises(BlockchainIQError, match="UNSAFE_PAYMENT_QUOTE"):
            validate_challenge(header, url, 30000)


# ---- get(): free, paid, limits ---------------------------------------------
def test_free_resource_is_read_without_a_wallet_or_the_budget():
    server = Server()
    c = client_with(server)
    assert [r["resource"] for r in c.list_resources()][:2] == ["sample", "brief"]
    result = c.get("sample")
    assert result.body["data"] == {"sample": True} and result.transaction is None
    assert c.signed_amounts == [] and c.budget()["payments"] == 0


def test_paid_resource_is_bought_once_and_the_default_single_payment_is_then_used_up():
    server = Server()
    c = client_with(server)
    result = c.get("network", {"chain": "base"})
    assert result.body["data"]["paid"] == f"{CATALOG_URL}/network/base"
    assert result.transaction == TX and result.basescan_url.endswith(TX)
    assert c.signed_amounts == [30000] and server.paid == [f"{CATALOG_URL}/network/base"]
    assert c.budget() == {"reservedUsd": "0.03", "maxTotalUsd": "0.05", "payments": 1, "remainingPayments": 0}
    with pytest.raises(BlockchainIQError, match="PAYMENT_BUDGET_EXHAUSTED"):
        c.get("brief")
    assert len(server.paid) == 1


def test_price_above_the_per_call_limit_is_refused_before_any_request_to_the_resource():
    server = Server()
    c = client_with(server)
    with pytest.raises(BlockchainIQError, match="PRICE_ABOVE_LIMIT"):
        c.get("analyst-pack")
    assert server.seen == [CATALOG_URL] and c.signed_amounts == [] and c.budget()["payments"] == 0


def test_owner_limits_allow_a_dearer_resource_and_the_total_stops_the_next_payment():
    server = Server()
    c = client_with(server, max_usdc_per_call="2.00", max_payments=5, max_total_usdc="2.04")
    assert c.limits() == {"maxPricePerCallUsd": "2.00", "maxTotalUsd": "2.04", "maxPayments": 5}
    c.get("analyst-pack")
    c.get("calendar")
    with pytest.raises(BlockchainIQError, match="PAYMENT_BUDGET_EXHAUSTED"):
        c.get("calendar")
    assert c.signed_amounts[:2] == [2_000_000, 30_000] and len(server.paid) == 2
    assert c.budget()["reservedUsd"] == "2.03"


def test_no_setting_raises_one_call_above_25_dollars():
    c = BlockchainIQClient(private_key="unused-offline", max_usdc_per_call="500")
    assert c.limits()["maxPricePerCallUsd"] == "25.00"
    for bad in ({"max_payments": 0}, {"max_payments": 1.5}, {"max_payments": True}, {"max_total_usdc": "lots"}, {"max_total_usdc": "0"}):
        with pytest.raises(BlockchainIQError, match="INVALID_OPTIONS"):
            BlockchainIQClient(private_key="unused-offline", **bad)


def test_server_quote_above_the_limit_is_never_signed():
    server = Server(accepts=lambda url: [base_option(60000), solana_option(60000)])
    c = client_with(server)
    with pytest.raises(BlockchainIQError, match="UNSAFE_PAYMENT_QUOTE"):
        c.get("brief")
    assert c.signed_amounts == [] and server.paid == [] and c.budget()["payments"] == 0


def test_unknown_ids_and_bad_parameters_are_refused_with_no_payment():
    server = Server()
    c = client_with(server)
    for rid in ("no-such-thing", "catalog", "poster", "elsewhere", "https://example.invalid/x", None):
        with pytest.raises(BlockchainIQError, match="UNKNOWN_RESOURCE"):
            c.get(rid)
    for params in (None, {"chain": "../brief"}, {"chain": "base", "url": "https://example.invalid"}):
        with pytest.raises(BlockchainIQError, match="INVALID_PARAMS"):
            c.get("network", params)
    assert set(server.seen) == {CATALOG_URL} and c.signed_amounts == []


def test_failed_or_unconfirmed_paid_responses_raise_and_keep_the_reservation():
    for server, code in (
        (Server(paid_status=500), "PAID_REQUEST_FAILED_NO_RETRY"),
        (Server(paid_status=402), "PAID_REQUEST_FAILED_NO_RETRY"),
        (Server(receipt={"success": False, "transaction": TX, "network": BASE_MAINNET}), "SETTLEMENT_UNCONFIRMED"),
        (Server(receipt={"success": True, "transaction": TX, "network": BASE_MAINNET, "payer": "0x" + "22" * 20}), "SETTLEMENT_UNCONFIRMED"),
        (Server(receipt={"success": True, "transaction": "0x12", "network": BASE_MAINNET, "payer": "0x" + "11" * 20}), "SETTLEMENT_UNCONFIRMED"),
        (Server(paid_body={"data": "no envelope"}), "INVALID_RESPONSE_ENVELOPE"),
    ):
        c = client_with(server, max_payments=2)
        with pytest.raises(BlockchainIQError, match=code):
            c.get("brief")
        assert c.budget()["payments"] == 1 and c.budget()["reservedUsd"] == "0.01"


def test_paid_get_needs_a_key(monkeypatch):
    monkeypatch.delenv("AGENT_PRIVATE_KEY", raising=False)
    c = BlockchainIQClient()
    c._free_session = Server()
    with pytest.raises(BlockchainIQError, match="AGENT_PRIVATE_KEY"):
        c.get("brief")
    assert c.budget()["payments"] == 0


def test_quote_resource_reports_the_server_price_and_signs_nothing():
    server = Server()
    c = client_with(server)
    assert c.quote_resource("analyst-pack") == {"resource": "analyst-pack", "url": f"{CATALOG_URL}/analyst-pack", "price": "$2.00"}
    assert c.quote_resource("sample")["price"] == "free"
    assert c.signed_amounts == []


# ---- LangChain tools ---------------------------------------------------------
def test_catalog_tools_list_and_get():
    server = Server()
    c = client_with(server)
    catalog_tool, get_tool = get_blockchainiq_catalog_tools(c)
    assert (catalog_tool.name, get_tool.name) == ("blockchainiq_catalog", "blockchainiq_get")
    assert "$0.05 per call" in get_tool.description
    rows = json.loads(catalog_tool.invoke({}))
    assert {"resource": "brief", "price": "$0.01", "title": "brief", "description": "about brief"} in rows
    out = json.loads(get_tool.invoke({"resource": "network", "params": {"chain": "base"}}))
    assert out["data"] == {"paid": f"{CATALOG_URL}/network/base"}
    assert out["payment"]["transaction"] == TX and out["budget"]["payments"] == 1
    for bad in ({"resource": "https://example.invalid"}, {"resource": "brief", "url": "https://example.invalid"}, {}):
        with pytest.raises(Exception):
            get_tool.invoke(bad)


# ---- the real x402 SDK signing path, offline ---------------------------------
def test_pinned_policy_lets_one_exact_base_payment_through_once():
    from x402.client_base import PaymentRequirements

    def req(amount=30000, **patch):
        return PaymentRequirements.model_validate(base_option(amount, **patch))

    assert len(pinned_policy(30000)(2, [req()])) == 1
    for reqs in ([req(30001)],[req(payTo="0x0000000000000000000000000000000000000001")],
                 [req(asset="0x0000000000000000000000000000000000000001")], [req(), req()], []):
        assert pinned_policy(30000)(2, reqs) == []
    assert pinned_policy(30000)(1, [req()]) == []
    policy = pinned_policy(30000)
    assert len(policy(2, [req()])) == 1 and policy(2, [req()]) == []


def test_real_sdk_signs_exactly_the_quoted_amount_to_the_pinned_payee(monkeypatch):
    """Runs the real x402 SDK and adapter with a throwaway key; only the network is a fixture."""
    account = Account.create()
    url = f"{CATALOG_URL}/analyst-pack"
    sent = []

    def fake_send(self, request, **kwargs):
        sent.append(request)

        def reply(status, body, headers):
            raw = HTTPResponse(body=io.BytesIO(json.dumps(body).encode()), status=status, headers=headers, preload_content=False)
            response = requests.Response()
            response.status_code, response.raw, response.url, response.request = status, raw, request.url, request
            response.headers = requests.structures.CaseInsensitiveDict(headers)
            return response

        assert request.url.startswith(CATALOG_URL)
        if request.url == CATALOG_URL:
            return reply(200, CATALOG, {"Content-Type": "application/json"})
        signature = request.headers.get("PAYMENT-SIGNATURE")
        if not signature:
            accepts = [base_option(2_000_000), solana_option(2_000_000)]
            return reply(402, {}, {"PAYMENT-REQUIRED": quote_header(request.url, accepts), "Content-Type": "application/json"})
        receipt = {"success": True, "transaction": TX, "network": BASE_MAINNET, "payer": account.address}
        return reply(200, {"source": "Blockchain IQ", "terms": TERMS, "data": {"ok": True}},
                     {"PAYMENT-RESPONSE": b64(receipt), "Content-Type": "application/json"})

    monkeypatch.setattr(HTTPAdapter, "send", fake_send)
    c = BlockchainIQClient(private_key=account.key.hex(), max_usdc_per_call="2.00")
    result = c.get("analyst-pack")
    assert result.transaction == TX and result.body["data"] == {"ok": True}
    paid = [r for r in sent if r.headers.get("PAYMENT-SIGNATURE")]
    assert len(paid) == 1 and paid[0].url == url
    payload = json.loads(base64.b64decode(paid[0].headers["PAYMENT-SIGNATURE"]))
    authorization = payload["payload"]["authorization"]
    assert authorization["value"] == "2000000"
    assert authorization["to"].lower() == PAY_TO.lower() and authorization["from"].lower() == account.address.lower()
    assert payload["accepted"]["network"] == BASE_MAINNET and payload["accepted"]["asset"].lower() == USDC_BASE.lower()
    assert c.budget() == {"reservedUsd": "2.00", "maxTotalUsd": "2.00", "payments": 1, "remainingPayments": 0}
