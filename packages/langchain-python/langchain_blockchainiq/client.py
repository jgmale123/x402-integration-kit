"""Small x402 client for https://www.blockchainiq.co/api/x402/v1.

Payment flow (x402 v2, USDC on Base, eip155:8453):
  1. GET the resource -> HTTP 402 with a PAYMENT-REQUIRED header (the price).
  2. The x402 SDK signs a USDC transferWithAuthorization (EIP-3009) for exactly
     that amount and retries the request with a PAYMENT-SIGNATURE header.
  3. HTTP 200 + JSON, and a PAYMENT-RESPONSE header with the settlement
     transaction hash. Settlement is gasless for the payer.

The private key is read from the AGENT_PRIVATE_KEY environment variable (or
passed in) and is only used locally to sign. It is never sent anywhere.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

import requests
from eth_account import Account
from x402 import x402ClientSync
from x402.client_base import max_amount
from x402.http.clients import wrapRequestsWithPayment
from x402.http.utils import decode_payment_response_header
from x402.mechanisms.evm.exact.register import register_exact_evm_client

BASE_URL = "https://www.blockchainiq.co/api/x402/v1"
BASE_MAINNET = "eip155:8453"
USDC_DECIMALS = 6
DEFAULT_MAX_USDC_PER_CALL = "0.05"  # brief is $0.01, event-risk is $0.05
USER_AGENT = "langchain-blockchainiq/0.1.0 (+https://scrapemole.pages.dev)"


class BlockchainIQError(RuntimeError):
    """Raised when Blockchain IQ returns an error or payment is refused."""


@dataclass
class PaidResult:
    """JSON body of a paid call plus its x402 settlement proof."""

    url: str
    status: int
    body: dict[str, Any]
    settlement: dict[str, Any] = field(default_factory=dict)

    @property
    def transaction(self) -> str | None:
        return self.settlement.get("transaction")

    @property
    def basescan_url(self) -> str | None:
        tx = self.transaction
        return f"https://basescan.org/tx/{tx}" if tx else None


def _usdc_to_atomic(usdc: str | float | Decimal) -> int:
    return int(Decimal(str(usdc)) * (10**USDC_DECIMALS))


class BlockchainIQClient:
    """Pays Blockchain IQ resources with x402 from a local EVM key.

    Args:
        private_key: hex key of a wallet holding a little USDC on Base.
            Defaults to the AGENT_PRIVATE_KEY environment variable. Use a
            dedicated wallet with a small balance, never a main wallet.
        max_usdc_per_call: hard cap per payment. A quote above it is refused
            before anything is signed.
        base_url: API root (override for testing).
    """

    def __init__(
        self,
        private_key: str | None = None,
        max_usdc_per_call: str | float = DEFAULT_MAX_USDC_PER_CALL,
        base_url: str = BASE_URL,
        timeout: float = 60.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_atomic = _usdc_to_atomic(max_usdc_per_call)
        self._private_key = private_key or os.environ.get("AGENT_PRIVATE_KEY")
        self._paying_session: requests.Session | None = None
        self._free_session = requests.Session()
        self._free_session.headers["User-Agent"] = USER_AGENT

    # -- free -----------------------------------------------------------
    def catalog(self) -> dict[str, Any]:
        """Free: every resource, price and response shape."""
        r = self._free_session.get(self.base_url, timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    def quote(self, path: str, params: dict[str, Any] | None = None) -> int:
        """Free: the price of a resource in atomic USDC (6 decimals), read
        from its unpaid HTTP 402 response. Nothing is signed or paid."""
        import base64
        import json

        r = self._free_session.get(
            f"{self.base_url}/{path.lstrip('/')}", params=params, timeout=self.timeout
        )
        if r.status_code != 402:
            raise BlockchainIQError(f"expected HTTP 402 quote, got {r.status_code}")
        header = r.headers.get("payment-required")
        if not header:
            raise BlockchainIQError("402 without a PAYMENT-REQUIRED header")
        try:
            req = json.loads(base64.b64decode(header))
            base = [a for a in req.get("accepts", []) if a.get("network") == BASE_MAINNET]
            if not base:
                raise BlockchainIQError("no USDC-on-Base payment option offered")
            return min(int(a["amount"]) for a in base)
        except BlockchainIQError:
            raise
        except (ValueError, TypeError, KeyError, AttributeError) as exc:
            raise BlockchainIQError(f"malformed PAYMENT-REQUIRED header: {exc}") from exc

    # -- paid -----------------------------------------------------------
    def _session(self) -> requests.Session:
        if self._paying_session is None:
            if not self._private_key:
                raise BlockchainIQError(
                    "Set AGENT_PRIVATE_KEY to a Base wallet holding a little USDC "
                    "(or pass private_key=...)."
                )
            account = Account.from_key(self._private_key)
            x402 = x402ClientSync()
            register_exact_evm_client(
                x402, account, networks=BASE_MAINNET, policies=[max_amount(self.max_atomic)]
            )
            x402.set_spend_controls(
                {"max_amount_per_payment": f"${Decimal(self.max_atomic) / 10**USDC_DECIMALS}"}
            )
            session = wrapRequestsWithPayment(requests.Session(), x402)
            session.headers["User-Agent"] = USER_AGENT
            self._paying_session = session
        return self._paying_session

    def get_paid(self, path: str, params: dict[str, Any] | None = None) -> PaidResult:
        """GET a paid resource, paying the 402 with x402 (capped)."""
        url = f"{self.base_url}/{path.lstrip('/')}"
        r = self._session().get(url, params=params, timeout=self.timeout)
        settlement: dict[str, Any] = {}
        header = r.headers.get("payment-response")
        if header:
            settled = decode_payment_response_header(header)
            settlement = (
                settled.model_dump(by_alias=True, exclude_none=True)
                if hasattr(settled, "model_dump")
                else dict(settled)
            )
        try:
            body = r.json()
        except ValueError:
            body = {"raw": r.text[:2000]}
        if r.status_code != 200:
            raise BlockchainIQError(f"HTTP {r.status_code} from {url}: {str(body)[:500]}")
        return PaidResult(url=r.url, status=r.status_code, body=body, settlement=settlement)

    def brief(self) -> PaidResult:
        """$0.01: BTC/ETH/SOL/XRP prices and moves, next-48h events, risk flags."""
        return self.get_paid("brief")

    def event_risk(self, days: int = 7, min_importance: int = 1) -> PaidResult:
        """$0.05: scheduled market-moving events for the next `days` (1-90)."""
        return self.get_paid("event-risk", {"days": days, "minImportance": min_importance})
