"""Added by Blockchain IQ. Read any catalogue resource by id.

    python examples/get_resource.py                      # free: list every resource and price
    python examples/get_resource.py brief                # free: quote only, signs nothing
    export AGENT_PRIVATE_KEY=0x...                       # a dedicated Base wallet with a little USDC
    python examples/get_resource.py brief --pay          # pays the catalogue price ($0.01)
    python examples/get_resource.py network chain=base --pay

Limits come from BIQ_MAX_USDC_PER_CALL (default 0.05), BIQ_MAX_PAYMENTS (default 1)
and BIQ_MAX_TOTAL_USDC. A resource priced above the per-call limit is refused before
any request to it. The key is used only to sign locally and is never printed.
"""

import json
import os
import sys

from langchain_blockchainiq import BlockchainIQClient

args = [a for a in sys.argv[1:] if a != "--pay"]
pay = "--pay" in sys.argv[1:]
client = BlockchainIQClient(
    max_usdc_per_call=os.environ.get("BIQ_MAX_USDC_PER_CALL", "0.05"),
    max_payments=int(os.environ.get("BIQ_MAX_PAYMENTS", "1")),
    max_total_usdc=os.environ.get("BIQ_MAX_TOTAL_USDC"),
)

if not args:
    for row in client.list_resources():
        print(f"{row['price']:>7}  {row['resource']:<32} {row['title']}")
    raise SystemExit(0)

resource = args[0]
params = dict(a.split("=", 1) for a in args[1:])
print(json.dumps(client.quote_resource(resource, params)))
if not pay:
    print("quote only; add --pay to buy it")
    raise SystemExit(0)

result = client.get(resource, params)
print(json.dumps(result.body)[:1500])
print("transaction:", result.transaction)
if result.basescan_url:
    print(result.basescan_url)
print("budget:", json.dumps(client.budget()))
