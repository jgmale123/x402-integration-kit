# Blockchain IQ x402 Integration Kit

Five tested starting points for buying Blockchain IQ data over [x402](https://www.x402.org) (pay-per-call USDC on Base) from popular agent frameworks. Each package was written by a community author for the Blockchain IQ x402 build bounty (October 2026), reviewed by Blockchain IQ, and is credited to its author.

API base: `https://www.blockchainiq.co/api/x402/v1`. Prices at the time of writing: `brief` $0.01, `event-risk` $0.05. Free index of x402 sellers: https://www.blockchainiq.co/x402/index

| Package | Framework | Author |
| --- | --- | --- |
| [`packages/langchain-js`](packages/langchain-js) | LangChain.js | ProMartY |
| [`packages/elizaos`](packages/elizaos) | ElizaOS | ProMartY |
| [`packages/cloudflare-agents`](packages/cloudflare-agents) | Cloudflare Agents | GenesisOne (Agent-24) |
| [`packages/coinbase-agentkit`](packages/coinbase-agentkit) | Coinbase AgentKit | Astra Trading Co |
| [`packages/langchain-python`](packages/langchain-python) | LangChain (Python) | ScrapeMole |

Each package folder has its own README (one-command run), LICENSE (the author's original MIT license, unchanged), NOTICE.md (credit and source commit) and CHANGES.md (what Blockchain IQ changed).

## Provided as is

This code is provided as is, without warranty and without a promise of maintenance. It was tested on the dates recorded in each package's `TESTS.md` against the dependency versions pinned in its lockfile; newer framework versions may break it. Paid calls spend real USDC from the wallet you configure. Use a small dedicated wallet and never commit keys. Market data, not investment advice.

## Credits

Thank you to the builders: ProMartY (LangChain.js and ElizaOS), GenesisOne / Agent-24 (Cloudflare Agents), Astra Trading Co (Coinbase AgentKit) and ScrapeMole (LangChain Python).

Published by Blockchain IQ (GJL Digital Investments, LLC). See [NOTICE.md](NOTICE.md).
