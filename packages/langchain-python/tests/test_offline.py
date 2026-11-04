"""Offline tests: no network, no wallet, nothing paid.

Every HTTP response is a mocked fixture. Run: python -m pytest -q
"""

import base64
import json

import pytest

from langchain_blockchainiq import (
    BlockchainIQBriefTool,
    BlockchainIQCatalogTool,
    BlockchainIQClient,
    BlockchainIQEventRiskTool,
    get_blockchainiq_tools,
)
from langchain_blockchainiq.client import BASE_URL, BlockchainIQError, _usdc_to_atomic

PAYER = "0x0000000000000000000000000000000000000001"
TX = "0x" + "ab" * 32


def b64(obj) -> str:
    return base64.b64encode(json.dumps(obj).encode()).decode()


def challenge(amount="10000", network="eip155:8453"):
    return b64({"x402Version": 2, "accepts": [{"network": network, "amount": amount}]})


class FakeResponse:
    def __init__(self, status=200, body=None, headers=None, text=None, url="https://x/test"):
        self.status_code = status
        self._body = body
        self.headers = headers or {}
        self.text = text if text is not None else json.dumps(body)
        self.url = url

    def json(self):
        if self._body is None:
            raise ValueError("not json")
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class FakeSession:
    """Stands in for requests.Session; records calls."""

    def __init__(self, response):
        self.response = response
        self.calls = []

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, params))
        return self.response


def client_with(response):
    c = BlockchainIQClient(private_key="unused-offline")
    fake = FakeSession(response)
    c._paying_session = fake  # bypass key handling and x402 wiring
    c._free_session = fake
    return c, fake


# ---- free quote (402 challenge) -----------------------------------------
def test_quote_success_reads_402_price():
    c, fake = client_with(FakeResponse(402, headers={"payment-required": challenge("10000")}))
    assert c.quote("brief") == 10_000
    assert fake.calls[0][0] == f"{BASE_URL}/brief"


def test_quote_picks_cheapest_base_option_and_ignores_other_networks():
    hdr = b64({"accepts": [
        {"network": "eip155:1", "amount": "1"},
        {"network": "eip155:8453", "amount": "50000"},
        {"network": "eip155:8453", "amount": "10000"},
    ]})
    c, _ = client_with(FakeResponse(402, headers={"payment-required": hdr}))
    assert c.quote("brief") == 10_000


def test_quote_non_402_raises():
    c, _ = client_with(FakeResponse(200, body={}))
    with pytest.raises(BlockchainIQError, match="expected HTTP 402"):
        c.quote("brief")


def test_quote_missing_header_raises():
    c, _ = client_with(FakeResponse(402))
    with pytest.raises(BlockchainIQError, match="PAYMENT-REQUIRED"):
        c.quote("brief")


def test_quote_no_base_option_raises():
    c, _ = client_with(FakeResponse(402, headers={"payment-required": challenge(network="eip155:1")}))
    with pytest.raises(BlockchainIQError, match="no USDC-on-Base"):
        c.quote("brief")


def test_quote_malformed_header_raises_clean_error():
    c, _ = client_with(FakeResponse(402, headers={"payment-required": "!!!not-base64-json"}))
    with pytest.raises(BlockchainIQError, match="malformed PAYMENT-REQUIRED"):
        c.quote("brief")


# ---- paid success -------------------------------------------------------
def test_brief_success_returns_body_and_settlement():
    body = {"data": {"coins": [{"symbol": "btc", "price": 1}], "events": [], "flags": []}}
    hdr = b64({"success": True, "transaction": TX, "network": "eip155:8453", "payer": PAYER})
    c, fake = client_with(FakeResponse(200, body=body, headers={"payment-response": hdr}))
    res = c.brief()
    assert res.status == 200 and res.body == body
    assert res.transaction == TX
    assert res.basescan_url == f"https://basescan.org/tx/{TX}"
    assert fake.calls[0][0] == f"{BASE_URL}/brief"


def test_event_risk_sends_params_to_event_risk_path():
    c, fake = client_with(FakeResponse(200, body={"data": []}))
    c.event_risk(days=14, min_importance=2)
    assert fake.calls[0] == (f"{BASE_URL}/event-risk", {"days": 14, "minImportance": 2})


def test_brief_tool_output_includes_payment_proof():
    body = {"data": {"coins": []}, "disclaimer": "Market data"}
    hdr = b64({"success": True, "transaction": TX, "network": "eip155:8453", "payer": PAYER})
    c, _ = client_with(FakeResponse(200, body=body, headers={"payment-response": hdr}))
    out = json.loads(BlockchainIQBriefTool(client=c).invoke({}))
    assert out["payment"] == {"transaction": TX, "network": "eip155:8453", "payer": PAYER}
    assert out["disclaimer"] == "Market data"


def test_event_risk_tool_passes_args():
    c, fake = client_with(FakeResponse(200, body={"data": [], "count": 0}))
    out = json.loads(BlockchainIQEventRiskTool(client=c).invoke({"days": 3, "min_importance": 3}))
    assert out["count"] == 0 and "payment" not in out
    assert fake.calls[0][1] == {"days": 3, "minImportance": 3}


# ---- unsatisfied 402, HTTP errors, malformed bodies ----------------------
def test_paid_call_still_402_raises():
    c, _ = client_with(FakeResponse(402, body={"error": "payment required"}))
    with pytest.raises(BlockchainIQError, match="HTTP 402"):
        c.brief()


def test_http_error_raises_with_status():
    c, _ = client_with(FakeResponse(500, body={"error": "boom"}))
    with pytest.raises(BlockchainIQError, match="HTTP 500"):
        c.brief()


def test_malformed_non_json_error_body_raises_clean_error():
    c, _ = client_with(FakeResponse(502, body=None, text="<html>bad gateway</html>" * 500))
    with pytest.raises(BlockchainIQError, match="HTTP 502"):
        c.brief()


def test_malformed_non_json_success_body_falls_back_to_raw():
    c, _ = client_with(FakeResponse(200, body=None, text="not json at all"))
    res = c.brief()
    assert res.body == {"raw": "not json at all"}
    assert res.transaction is None


# ---- safety and wiring ---------------------------------------------------
def test_paid_call_needs_key(monkeypatch):
    monkeypatch.delenv("AGENT_PRIVATE_KEY", raising=False)
    with pytest.raises(BlockchainIQError, match="AGENT_PRIVATE_KEY"):
        BlockchainIQClient().brief()


def test_default_cap_is_five_cents_and_atomic_conversion():
    assert BlockchainIQClient().max_atomic == 50_000
    assert BlockchainIQClient(max_usdc_per_call="0.01").max_atomic == 10_000
    assert _usdc_to_atomic("0.01") == 10_000


def test_tools_have_expected_names_and_schemas():
    names = [t.name for t in get_blockchainiq_tools(BlockchainIQClient())]
    assert names == ["blockchainiq_catalog", "blockchainiq_market_brief", "blockchainiq_event_risk"]
    assert BlockchainIQBriefTool(client=BlockchainIQClient()).args == {}


def test_catalog_tool_formats_rows():
    cat = {"data": [{"id": "brief", "path": "/brief", "price": "$0.01", "title": "Brief", "x": 1}]}
    c, _ = client_with(FakeResponse(200, body=cat))
    rows = json.loads(BlockchainIQCatalogTool(client=c).invoke({}))
    assert rows == [{"id": "brief", "path": "/brief", "price": "$0.01", "title": "Brief"}]
