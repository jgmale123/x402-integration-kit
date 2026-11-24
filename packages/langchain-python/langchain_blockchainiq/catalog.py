"""Added by Blockchain IQ (see CHANGES.md).

Reads the free catalogue and turns a resource id plus parameters into one URL
on the fixed Blockchain IQ origin. Nothing here can name another host.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode, urlsplit

ORIGIN = "https://www.blockchainiq.co"
CATALOG_URL = f"{ORIGIN}/api/x402/v1"
TERMS = "https://www.blockchainiq.co/terms"

_PATH = re.compile(r"/api/x402/v1(/(\{[A-Za-z][A-Za-z0-9]{0,31}\}|[A-Za-z0-9][A-Za-z0-9._-]{0,127}))*")
_SEGMENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")
_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,63}")
_PRICE = re.compile(r"\$(\d{1,4})\.(\d{2})")
_QUERY_NAME = re.compile(r"[A-Za-z][A-Za-z0-9_]{0,31}")
_PATH_PARAM = re.compile(r"\{([A-Za-z][A-Za-z0-9]*)\}")


class CatalogError(ValueError):
    """The catalogue, a resource id or its parameters were not acceptable."""


@dataclass(frozen=True)
class Resource:
    id: str
    path: str
    price: str
    price_atomic: int  # USDC atomic units (6 decimals); 0 when free
    title: str
    description: str
    path_params: tuple[str, ...]
    query_params: tuple[str, ...]


def _price_atomic(price: Any) -> int | None:
    if price == "free":
        return 0
    match = _PRICE.fullmatch(price) if isinstance(price, str) else None
    return int(match.group(1)) * 1_000_000 + int(match.group(2)) * 10_000 if match else None


def parse_catalog(body: Any) -> dict[str, Resource]:
    """Keeps only well-formed GET entries; a malformed entry is skipped, never trusted."""
    if (
        not isinstance(body, dict)
        or body.get("source") != "Blockchain IQ"
        or body.get("terms") != TERMS
        or not isinstance(body.get("data"), list)
        or len(body["data"]) > 2000
    ):
        raise CatalogError("INVALID_CATALOG")
    resources: dict[str, Resource] = {}
    for entry in body["data"]:
        if not isinstance(entry, dict):
            continue
        rid, path, atomic = entry.get("id"), entry.get("path"), _price_atomic(entry.get("price"))
        if (
            not isinstance(rid, str) or not _ID.fullmatch(rid) or entry.get("method") != "GET"
            or not isinstance(path, str) or not _PATH.fullmatch(path)
            or atomic is None or rid in resources
        ):
            continue
        discovery = entry.get("discovery")
        schema = discovery.get("inputSchema") if isinstance(discovery, dict) else None
        properties = schema.get("properties") if isinstance(schema, dict) else None
        title, description = entry.get("title"), entry.get("description")
        resources[rid] = Resource(
            id=rid,
            path=path,
            price=entry["price"],
            price_atomic=atomic,
            title=title[:200] if isinstance(title, str) else rid,
            description=description[:600] if isinstance(description, str) else "",
            path_params=tuple(_PATH_PARAM.findall(path)),
            query_params=tuple(k for k in properties if isinstance(k, str) and _QUERY_NAME.fullmatch(k))
            if isinstance(properties, dict) else (),
        )
    if not resources:
        raise CatalogError("INVALID_CATALOG")
    return resources


def list_resources(resources: dict[str, Resource]) -> list[dict[str, Any]]:
    """A short list an agent can read to choose a resource."""
    rows = []
    for r in resources.values():
        if r.id == "catalog":
            continue
        row: dict[str, Any] = {"resource": r.id, "price": r.price, "title": r.title, "description": r.description}
        if r.path_params:
            row["requiredParams"] = list(r.path_params)
        if r.query_params:
            row["optionalParams"] = list(r.query_params)
        rows.append(row)
    return rows


def build_url(resource: Resource, params: dict[str, Any] | None = None) -> str:
    """Path parameters are required and limited to one safe segment; query
    parameters must be ones the catalogue lists."""
    params = {} if params is None else params
    if not isinstance(resource, Resource) or not isinstance(params, dict):
        raise CatalogError("INVALID_PARAMS")
    known = set(resource.path_params) | set(resource.query_params)
    if any(key not in known for key in params):
        raise CatalogError("INVALID_PARAMS")
    path = resource.path
    for name in resource.path_params:
        value = params.get(name)
        if not isinstance(value, str) or not _SEGMENT.fullmatch(value) or ".." in value:
            raise CatalogError("INVALID_PARAMS")
        path = path.replace("{" + name + "}", value)
    query: list[tuple[str, str]] = []
    for name in resource.query_params:
        if name not in params:
            continue
        value = params[name]
        if isinstance(value, bool):
            text = "true" if value else "false"
        elif isinstance(value, (int, str)):
            text = str(value)
        elif isinstance(value, float) and math.isfinite(value):
            text = repr(value)
        else:
            raise CatalogError("INVALID_PARAMS")
        if not 1 <= len(text) <= 256:
            raise CatalogError("INVALID_PARAMS")
        query.append((name, text))
    url = f"{ORIGIN}{path}" + (f"?{urlencode(query)}" if query else "")
    parts = urlsplit(url)
    if (
        f"{parts.scheme}://{parts.netloc}" != ORIGIN
        or not parts.path.startswith("/api/x402/v1/")
        or parts.fragment
        or "@" in parts.netloc
    ):
        raise CatalogError("INVALID_PARAMS")
    return url
