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

import base64
import json
import os
import re
import threading
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
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

# Added by Blockchain IQ (see CHANGES.md): what `get()` is allowed to pay.
from langchain_blockchainiq.catalog import (  # noqa: E402
    CATALOG_URL,
    TERMS,
    CatalogError,
    Resource,
    build_url,
    list_resources,
    parse_catalog,
)

USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
PAY_TO = "0x617dA9383fbA67e86137BC4924b8b7E400fB7C9e"
HARD_MAX_ATOMIC = 25_000_000  # no setting can raise one call above 25.00 USDC
_HEADER_LIMIT = 262_144
_AMOUNT = re.compile(r"[1-9]\d{0,7}")
_TX = re.compile(r"0x[0-9a-fA-F]{64}")


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


def _atomic_to_usd(atomic: int) -> str:
    text = f"{atomic // 1_000_000}.{atomic % 1_000_000:06d}"
    return re.sub(r"(\.\d{2}\d*?)0+$", r"\1", text)


def validate_challenge(header: Any, url: str, max_atomic: int) -> int:
    """Added by Blockchain IQ. Checks an unpaid 402 quote and returns its price in
    atomic USDC. The server offers one option per rail (Base and Solana): exactly
    one option must be USDC on Base to the pinned payee, for `url`, at or under
    `max_atomic`. Options on other networks are ignored and never signed."""
    bad = BlockchainIQError("UNSAFE_PAYMENT_QUOTE: the 402 quote does not match the approved Blockchain IQ payment")
    if not isinstance(header, str) or not header or len(header) > _HEADER_LIMIT:
        raise bad
    try:
        quote = json.loads(base64.b64decode(header, validate=True))
    except (ValueError, TypeError) as exc:
        raise bad from exc
    if not isinstance(quote, dict) or quote.get("x402Version") != 2:
        raise bad
    resource, accepts = quote.get("resource"), quote.get("accepts")
    if not isinstance(resource, dict) or resource.get("url") != url:
        raise bad
    if not isinstance(accepts, list) or not 1 <= len(accepts) <= 8:
        raise bad
    on_base = [a for a in accepts if isinstance(a, dict) and a.get("network") == BASE_MAINNET]
    if len(on_base) != 1:
        raise bad
    q = on_base[0]
    amount, timeout, extra = q.get("amount"), q.get("maxTimeoutSeconds"), q.get("extra")
    if (
        q.get("scheme") != "exact"
        or not isinstance(q.get("asset"), str) or q["asset"].lower() != USDC_BASE.lower()
        or not isinstance(q.get("payTo"), str) or q["payTo"].lower() != PAY_TO.lower()
        or not isinstance(amount, str) or not _AMOUNT.fullmatch(amount) or int(amount) > max_atomic
        or isinstance(timeout, bool) or not isinstance(timeout, int) or not 1 <= timeout <= 300
        or not isinstance(extra, dict) or extra.get("name") != "USD Coin" or extra.get("version") != "2"
        or any(k not in ("name", "version") for k in extra)
    ):
        raise bad
    return int(amount)


def pinned_policy(amount: int):
    """Added by Blockchain IQ. An x402 SDK policy for one purchase: it lets through
    only USDC on Base to the pinned payee for exactly `amount`, and only once, so a
    single `get()` can never sign twice."""
    used = False

    def policy(version: int, reqs: list[Any]) -> list[Any]:
        nonlocal used
        if used or version != 2:
            return []
        matching = [
            r for r in reqs
            if r.network == BASE_MAINNET and r.scheme == "exact"
            and str(r.asset).lower() == USDC_BASE.lower()
            and str(r.pay_to).lower() == PAY_TO.lower()
            and str(r.get_amount()) == str(amount)
        ]
        if len(matching) != 1:
            return []
        used = True
        return matching

    return policy


class BlockchainIQClient:
    """Pays Blockchain IQ resources with x402 from a local EVM key.

    Args:
        private_key: hex key of a wallet holding a little USDC on Base.
            Defaults to the AGENT_PRIVATE_KEY environment variable. Use a
            dedicated wallet with a small balance, never a main wallet.
        max_usdc_per_call: hard cap per payment. A quote above it is refused
            before anything is signed.
        base_url: API root (override for testing).
        max_payments: added by Blockchain IQ. The most payments `get()` will
            ever sign on this client (default 1).
        max_total_usdc: added by Blockchain IQ. The most `get()` will ever
            spend on this client (default max_usdc_per_call x max_payments).

    `get()` reads any resource in the live catalogue within those limits and
    never pays more than 25.00 USDC for one call. `brief()` and `event_risk()`
    are unchanged: they are capped per call only and are not counted.
    """

    def __init__(
        self,
        private_key: str | None = None,
        max_usdc_per_call: str | float = DEFAULT_MAX_USDC_PER_CALL,
        base_url: str = BASE_URL,
        timeout: float = 60.0,
        max_payments: int = 1,
        max_total_usdc: str | float | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_atomic = _usdc_to_atomic(max_usdc_per_call)
        self._private_key = private_key or os.environ.get("AGENT_PRIVATE_KEY")
        self._paying_session: requests.Session | None = None
        self._free_session = requests.Session()
        self._free_session.headers["User-Agent"] = USER_AGENT
        # Added by Blockchain IQ: limits and running count for get().
        if isinstance(max_payments, bool) or not isinstance(max_payments, int) or not 1 <= max_payments <= 10_000:
            raise BlockchainIQError("INVALID_OPTIONS: max_payments must be a whole number from 1 to 10000")
        self.max_payments = max_payments
        self.max_per_call_atomic = min(self.max_atomic, HARD_MAX_ATOMIC)
        try:
            self.max_total_atomic = (
                self.max_per_call_atomic * max_payments if max_total_usdc is None else _usdc_to_atomic(max_total_usdc)
            )
        except (InvalidOperation, ValueError) as exc:
            raise BlockchainIQError("INVALID_OPTIONS: max_total_usdc must be a plain dollar amount") from exc
        if self.max_per_call_atomic < 1 or self.max_total_atomic < 1:
            raise BlockchainIQError("INVALID_OPTIONS: limits must be positive")
        self._reserved_atomic = 0
        self._payments = 0
        self._lock = threading.Lock()
        self._resources: dict[str, Resource] | None = None

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

    # -- any catalogue resource (added by Blockchain IQ) ------------------
    def resources(self, refresh: bool = False) -> dict[str, Resource]:
        """Free: the parsed live catalogue, keyed by resource id."""
        if self._resources is None or refresh:
            r = self._free_session.get(CATALOG_URL, timeout=self.timeout, allow_redirects=False)
            if r.status_code != 200:
                raise BlockchainIQError(f"catalogue request failed with HTTP {r.status_code}")
            try:
                self._resources = parse_catalog(r.json())
            except ValueError as exc:
                raise BlockchainIQError("INVALID_CATALOG: the catalogue could not be read") from exc
        return self._resources

    def list_resources(self, refresh: bool = False) -> list[dict[str, Any]]:
        """Free: id, price, description and parameters of every resource."""
        return list_resources(self.resources(refresh))

    def limits(self) -> dict[str, Any]:
        return {
            "maxPricePerCallUsd": _atomic_to_usd(self.max_per_call_atomic),
            "maxTotalUsd": _atomic_to_usd(self.max_total_atomic),
            "maxPayments": self.max_payments,
        }

    def budget(self) -> dict[str, Any]:
        """What get() has reserved so far. A reservation is never refunded automatically."""
        return {
            "reservedUsd": _atomic_to_usd(self._reserved_atomic),
            "maxTotalUsd": _atomic_to_usd(self.max_total_atomic),
            "payments": self._payments,
            "remainingPayments": self.max_payments - self._payments,
        }

    def _resolve(self, resource_id: str, params: dict[str, Any] | None) -> tuple[Resource, str]:
        resource = self.resources().get(resource_id) if isinstance(resource_id, str) else None
        if resource is None or resource.id == "catalog":
            raise BlockchainIQError("UNKNOWN_RESOURCE: list_resources() shows the ids")
        try:
            return resource, build_url(resource, params)
        except CatalogError as exc:
            raise BlockchainIQError(
                f"INVALID_PARAMS: required {list(resource.path_params)}, optional {list(resource.query_params)}"
            ) from exc

    def _unpaid_quote(self, url: str, max_atomic: int) -> int:
        r = self._free_session.get(url, timeout=self.timeout, allow_redirects=False)
        if r.status_code != 402:
            raise BlockchainIQError(f"EXPECTED_PAYMENT_REQUIRED: got HTTP {r.status_code}")
        return validate_challenge(r.headers.get("payment-required"), url, max_atomic)

    def quote_resource(self, resource_id: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        """Free: the server's price for one resource. Signs nothing."""
        resource, url = self._resolve(resource_id, params)
        if resource.price_atomic == 0:
            return {"resource": resource.id, "url": url, "price": "free"}
        amount = self._unpaid_quote(url, HARD_MAX_ATOMIC)
        return {"resource": resource.id, "url": url, "price": f"${_atomic_to_usd(amount)}"}

    def _resource_session(self, amount: int) -> tuple[requests.Session, str]:
        """A paying session for one purchase of exactly `amount`, and the payer address."""
        if not self._private_key:
            raise BlockchainIQError(
                "Set AGENT_PRIVATE_KEY to a Base wallet holding a little USDC (or pass private_key=...)."
            )
        account = Account.from_key(self._private_key)
        x402 = x402ClientSync()
        register_exact_evm_client(x402, account, networks=BASE_MAINNET, policies=[pinned_policy(amount)])
        # The SDK refuses payments above $1 unless told otherwise; the cap is this call's exact price.
        x402.set_spend_controls(
            {"allowed_assets": [{"network": BASE_MAINNET, "asset": USDC_BASE, "max_amount_per_payment": str(amount)}]}
        )
        session = wrapRequestsWithPayment(requests.Session(), x402)
        session.headers["User-Agent"] = USER_AGENT
        return session, account.address

    def get(self, resource_id: str, params: dict[str, Any] | None = None) -> PaidResult:
        """Reads one catalogue resource by id, paying for it when it has a price
        and the price is within the owner's limits. The arguments can only name a
        catalogue resource and its listed parameters; the URL is built here."""
        resource, url = self._resolve(resource_id, params)
        if resource.price_atomic == 0:
            r = self._free_session.get(url, timeout=self.timeout, allow_redirects=False)
            if r.status_code != 200:
                raise BlockchainIQError(f"FREE_REQUEST_FAILED: HTTP {r.status_code}")
            return PaidResult(url=url, status=200, body=self._envelope(r))
        if resource.price_atomic > self.max_per_call_atomic:
            raise BlockchainIQError(
                f"PRICE_ABOVE_LIMIT: {resource.id} costs {resource.price}; the per-call limit is "
                f"${_atomic_to_usd(self.max_per_call_atomic)}. Nothing was requested or signed."
            )
        amount = self._unpaid_quote(url, self.max_per_call_atomic)
        session, payer = self._resource_session(amount)
        with self._lock:
            if self._payments >= self.max_payments or self._reserved_atomic + amount > self.max_total_atomic:
                raise BlockchainIQError("PAYMENT_BUDGET_EXHAUSTED: the owner's limits are used up; nothing was signed")
            # Never refunded automatically: a failed or late response may still have been paid.
            self._reserved_atomic += amount
            self._payments += 1
        try:
            r = session.get(url, timeout=self.timeout, allow_redirects=False)
        except Exception as exc:
            raise BlockchainIQError(f"PAID_REQUEST_FAILED_NO_RETRY: {type(exc).__name__}") from exc
        if r.status_code != 200:
            raise BlockchainIQError(f"PAID_REQUEST_FAILED_NO_RETRY: HTTP {r.status_code}")
        settlement: dict[str, Any] = {}
        try:
            settled = decode_payment_response_header(r.headers.get("payment-response") or "")
            settlement = (
                settled.model_dump(by_alias=True, exclude_none=True) if hasattr(settled, "model_dump") else dict(settled)
            )
        except Exception as exc:
            raise BlockchainIQError("SETTLEMENT_UNCONFIRMED: no readable PAYMENT-RESPONSE header") from exc
        if (
            settlement.get("success") is not True
            or settlement.get("network") != BASE_MAINNET
            or not isinstance(settlement.get("transaction"), str)
            or not _TX.fullmatch(settlement["transaction"])
            or str(settlement.get("payer", "")).lower() != payer.lower()
        ):
            raise BlockchainIQError("SETTLEMENT_UNCONFIRMED: the receipt does not match this payment")
        return PaidResult(url=url, status=200, body=self._envelope(r), settlement=settlement)

    @staticmethod
    def _envelope(response: Any) -> dict[str, Any]:
        """Every Blockchain IQ x402 response carries the same envelope; anything else is rejected."""
        try:
            body = response.json()
        except ValueError as exc:
            raise BlockchainIQError("INVALID_RESPONSE: the body is not JSON") from exc
        if not isinstance(body, dict) or body.get("source") != "Blockchain IQ" or body.get("terms") != TERMS:
            raise BlockchainIQError("INVALID_RESPONSE_ENVELOPE")
        return body

    def brief(self) -> PaidResult:
        """$0.01: BTC/ETH/SOL/XRP prices and moves, next-48h events, risk flags."""
        return self.get_paid("brief")

    def event_risk(self, days: int = 7, min_importance: int = 1) -> PaidResult:
        """$0.05: scheduled market-moving events for the next `days` (1-90)."""
        return self.get_paid("event-risk", {"days": days, "minImportance": min_importance})
