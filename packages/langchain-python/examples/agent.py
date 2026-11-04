"""Use the tools inside a LangChain agent (any tool-calling chat model).

    pip install langchain langchain-openai   # or langchain-anthropic, etc.
    export AGENT_PRIVATE_KEY=0x... OPENAI_API_KEY=...
    python examples/agent.py
"""

from langchain.agents import create_agent

from langchain_blockchainiq import BlockchainIQClient, get_blockchainiq_tools

tools = get_blockchainiq_tools(BlockchainIQClient(max_usdc_per_call="0.05"))
agent = create_agent("openai:gpt-4.1-mini", tools=tools)
out = agent.invoke({"messages": [{"role": "user", "content":
    "Give me a 3-line crypto market read and any high-importance events in the next 48h."}]})
print(out["messages"][-1].content)
