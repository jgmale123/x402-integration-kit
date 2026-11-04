"""Make one real paid call through the LangChain tool and print the proof.

    export AGENT_PRIVATE_KEY=0x...   # a dedicated Base wallet with >= $0.01 USDC
    python examples/paid_call.py

Costs $0.01 USDC (the `brief` resource). The per-call cap is set to $0.01, so
any higher quote is refused before anything is signed.
"""

import json

from langchain_blockchainiq import BlockchainIQBriefTool, BlockchainIQClient

client = BlockchainIQClient(max_usdc_per_call="0.01")

price = client.quote("brief")  # free: reads the unpaid 402
print(f"quoted price for /brief: {price / 1e6:.2f} USDC")
if price > 10_000:
    raise SystemExit("quote above $0.01, refusing to pay")

tool = BlockchainIQBriefTool(client=client)
result = json.loads(tool.invoke({}))  # standard LangChain Runnable call

coins = result["data"].get("coins", [])
for c in coins:
    print(f"{c['symbol'].upper():>4}  ${c['price']:,}  24h {c.get('change24h')}%")
print(f"events next 48h: {len(result['data'].get('events', []))}, "
      f"flags: {result['data'].get('flags', [])[:3]}")
pay = result.get("payment", {})
print("settlement network:", pay.get("network"))
print("payer:", pay.get("payer"))
print("transaction:", pay.get("transaction"))
if pay.get("transaction"):
    print(f"https://basescan.org/tx/{pay['transaction']}")
