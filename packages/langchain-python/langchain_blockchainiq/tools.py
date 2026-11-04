"""LangChain tools wrapping Blockchain IQ's x402 API."""

from __future__ import annotations

import json
from typing import Any, Optional, Type

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field, PrivateAttr

from langchain_blockchainiq.client import BlockchainIQClient, PaidResult


def _format(result: PaidResult) -> str:
    out: dict[str, Any] = {"data": result.body.get("data", result.body)}
    for key in ("flagCount", "eventCount", "count", "disclaimer"):
        if key in result.body:
            out[key] = result.body[key]
    if result.transaction:
        out["payment"] = {
            "transaction": result.transaction,
            "network": result.settlement.get("network"),
            "payer": result.settlement.get("payer"),
        }
    return json.dumps(out, default=str)


class _BIQTool(BaseTool):
    client: Optional[BlockchainIQClient] = None
    _client: BlockchainIQClient = PrivateAttr()

    model_config = {"arbitrary_types_allowed": True}

    def model_post_init(self, __context: Any) -> None:
        self._client = self.client or BlockchainIQClient()


class _NoArgs(BaseModel):
    pass


class BlockchainIQBriefTool(_BIQTool):
    """Paid ($0.01 USDC on Base via x402): crypto market brief."""

    name: str = "blockchainiq_market_brief"
    description: str = (
        "Crypto market brief from Blockchain IQ: BTC, ETH, SOL and XRP prices with "
        "24h/7d/30d moves and rank, scheduled macro and crypto events in the next 48 "
        "hours, and short risk flags. No parameters. Costs $0.01 USDC per call, paid "
        "automatically over x402. Use as the opening call of a trading, portfolio or "
        "research task. Market data, not investment advice."
    )
    args_schema: Type[BaseModel] = _NoArgs

    def _run(self, run_manager: Any = None) -> str:
        return _format(self._client.brief())


class _EventRiskArgs(BaseModel):
    days: int = Field(7, ge=1, le=90, description="How many days ahead to look (1-90).")
    min_importance: int = Field(
        1, ge=1, le=3, description="1 = everything, 3 = only the most market-moving."
    )


class BlockchainIQEventRiskTool(_BIQTool):
    """Paid ($0.05 USDC on Base via x402): scheduled event risk."""

    name: str = "blockchainiq_event_risk"
    description: str = (
        "Scheduled market-moving events from Blockchain IQ: US data releases (CPI, "
        "jobs, GDP, PCE, PPI) with times, FOMC/ECB/BoJ decisions, Treasury auctions "
        "and dated crypto and regulatory milestones, each with importance 1-3 and an "
        "official source. Costs $0.05 USDC per call, paid automatically over x402. "
        "Use before a trade or a scheduled action."
    )
    args_schema: Type[BaseModel] = _EventRiskArgs

    def _run(self, days: int = 7, min_importance: int = 1, run_manager: Any = None) -> str:
        return _format(self._client.event_risk(days=days, min_importance=min_importance))


class BlockchainIQCatalogTool(_BIQTool):
    """Free: list every Blockchain IQ resource with its price."""

    name: str = "blockchainiq_catalog"
    description: str = (
        "Free. Lists every Blockchain IQ x402 resource with its path, price and "
        "description. Use to check prices before choosing a paid tool."
    )
    args_schema: Type[BaseModel] = _NoArgs

    def _run(self, run_manager: Any = None) -> str:
        cat = self._client.catalog()
        rows = [
            {"id": r.get("id"), "path": r.get("path"), "price": r.get("price"),
             "title": r.get("title")}
            for r in cat.get("data", [])
        ]
        return json.dumps(rows)


def get_blockchainiq_tools(client: Optional[BlockchainIQClient] = None) -> list[BaseTool]:
    """All three tools sharing one client (one wallet, one spend cap)."""
    client = client or BlockchainIQClient()
    return [
        BlockchainIQCatalogTool(client=client),
        BlockchainIQBriefTool(client=client),
        BlockchainIQEventRiskTool(client=client),
    ]
