"""Added by Blockchain IQ. Free check: ask the live API for the price of every paid
resource and compare it with the catalogue. Signs nothing and needs no wallet.

    python examples/quote_all.py
"""

from langchain_blockchainiq import BlockchainIQClient
from langchain_blockchainiq.client import BlockchainIQError

SAMPLE = {"slug": "bitcoin-on-chain", "panel": "summary", "section": "markets", "chain": "base", "symbol": "BTC", "coin": "bitcoin"}

client = BlockchainIQClient()
matched = differed = failed = 0
for row in client.list_resources():
    if row["price"] == "free":
        continue
    params = {name: SAMPLE.get(name, "x") for name in row.get("requiredParams", [])}
    try:
        quoted = client.quote_resource(row["resource"], params)["price"]
    except BlockchainIQError as exc:
        failed += 1
        print(f"{row['resource']:<32} catalogue {row['price']:>7}  no quote: {str(exc)[:60]}")
        continue
    same = float(quoted[1:]) == float(row["price"][1:])
    matched += same
    differed += not same
    print(f"{row['resource']:<32} catalogue {row['price']:>7}  quoted {quoted:>7}  {'same' if same else 'DIFFERENT'}")
print(f"\n{matched} quotes equal the catalogue price, {differed} differ, {failed} gave no quote")
