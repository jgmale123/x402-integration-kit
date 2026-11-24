# Blockchain IQ x402 Integration Kit

Five tested starting points for buying Blockchain IQ data over [x402](https://www.x402.org) (pay-per-call USDC on Base) from popular agent frameworks. Each package was written by a community author for the Blockchain IQ x402 build bounty (October 2026), reviewed by Blockchain IQ, and is credited to its author.

API base and live catalogue: `https://www.blockchainiq.co/api/x402/v1`. Free index of x402 sellers: https://www.blockchainiq.co/x402/index

## Every resource in the catalogue (11/24/2026)

Each package can now read any resource in the live catalogue, not only the one or two it started with. On 11/24/2026 the catalogue listed 49 resources: 6 free and 43 paid, from $0.01 to $19.00 a call (market brief, event risk, macro, indices, coin research, reports, Dispatches, dashboards, stablecoin and Cardano data, and more). The catalogue changes as products are added; each package reads it live.

| Package | Framework | Author | Reads the catalogue with | Version |
| --- | --- | --- | --- | --- |
| [`packages/langchain-js`](packages/langchain-js) | LangChain.js | ProMartY | tools `blockchainiq_catalog`, `blockchainiq_get` | 0.2.0 |
| [`packages/elizaos`](packages/elizaos) | ElizaOS | ProMartY | action `BLOCKCHAINIQ_GET` | 0.2.0 |
| [`packages/cloudflare-agents`](packages/cloudflare-agents) | Cloudflare Agents | GenesisOne (Agent-24) | routes `GET /catalog`, `POST /resource`, `GET /ledger` | 0.2.0 |
| [`packages/coinbase-agentkit`](packages/coinbase-agentkit) | Coinbase AgentKit | Astra Trading Co | actions `list_resources`, `get_resource` | 1.1.0 |
| [`packages/langchain-python`](packages/langchain-python) | LangChain (Python) | ScrapeMole | tools `blockchainiq_catalog`, `blockchainiq_get` | 0.2.0 |

The same rules hold in all five:

1. The owner sets the spending limits; the agent cannot. The default is $0.05 a call, so dollar-priced resources are refused until you raise the limit on purpose. No setting can raise one call above $25.00.
2. A resource priced above the per-call limit is refused before anything is signed.
3. The agent can name a catalogue resource and its listed parameters, and nothing else. The URL is built in code on the fixed Blockchain IQ origin.
4. Payment is USDC on Base to the Blockchain IQ payee only. The API now quotes one option per rail (Base and Solana); these packages sign the Base option and ignore the other. Versions before 11/24/2026 of the LangChain.js, ElizaOS and Cloudflare packages refused a quote with two options, so they stopped working when the Solana rail was added; update to the versions above.
5. The original single-resource tools still work as before.

Each package folder has its own README (one-command run), LICENSE (the author's original MIT license, unchanged), NOTICE.md (credit and source commit) and CHANGES.md (what Blockchain IQ changed).

## Provided as is

This code is provided as is, without warranty and without a promise of maintenance. It was tested on the dates recorded in each package's `TESTS.md` against the dependency versions pinned in its lockfile; newer framework versions may break it. Paid calls spend real USDC from the wallet you configure. Use a small dedicated wallet and never commit keys. Market data, not investment advice.

## Credits

Thank you to the builders: ProMartY (LangChain.js and ElizaOS), GenesisOne / Agent-24 (Cloudflare Agents), Astra Trading Co (Coinbase AgentKit) and ScrapeMole (LangChain Python).

Published by Blockchain IQ (GJL Digital Investments, LLC). See [NOTICE.md](NOTICE.md).
