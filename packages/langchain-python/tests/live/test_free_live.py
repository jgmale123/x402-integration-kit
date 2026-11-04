"""Original upstream tests: free live checks (catalog and unpaid 402 quote).

They need network access to blockchainiq.co, so they are skipped unless
BIQ_LIVE_TESTS=1 is set. They sign nothing and pay nothing. The offline suite
in tests/test_offline.py is the default.
"""

import os

import pytest

from langchain_blockchainiq import BlockchainIQBriefTool, BlockchainIQClient, get_blockchainiq_tools

pytestmark = pytest.mark.skipif(
    os.environ.get("BIQ_LIVE_TESTS") != "1", reason="live network tests; set BIQ_LIVE_TESTS=1"
)


def test_catalog_lists_brief_and_event_risk():
    ids = {r["id"] for r in BlockchainIQClient().catalog()["data"]}
    assert {"brief", "event-risk"} <= ids


def test_quote_reads_402_without_paying():
    assert BlockchainIQClient().quote("brief") == 10_000  # $0.01


def test_tools_have_schemas():
    names = [t.name for t in get_blockchainiq_tools(BlockchainIQClient())]
    assert names == ["blockchainiq_catalog", "blockchainiq_market_brief", "blockchainiq_event_risk"]
    assert BlockchainIQBriefTool(client=BlockchainIQClient()).args == {}


def test_paid_call_needs_key(monkeypatch):
    monkeypatch.delenv("AGENT_PRIVATE_KEY", raising=False)
    try:
        BlockchainIQClient().brief()
    except RuntimeError as e:
        assert "AGENT_PRIVATE_KEY" in str(e)
    else:
        raise AssertionError("expected an error without a key")
