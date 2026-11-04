// Makes one real paid call ($0.01 USDC on Base) through the AgentKit action provider.
// AGENT_PRIVATE_KEY=0x... node examples/paid-call.js
import { AgentKit, ViemWalletProvider } from "@coinbase/agentkit";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { blockchainIQActionProvider } from "../src/index.js";

// AgentKit's wallet-provider init fires an un-awaited analytics request; if that
// request fails it surfaces as an unhandled rejection and kills Node. Ignore only that.
process.on("unhandledRejection", (e) => {
  if (String(e?.stack ?? e).includes("sendAnalyticsEvent")) return;
  console.error(e); process.exit(1);
});

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY);
const walletProvider = new ViemWalletProvider(createWalletClient({ account, chain: base, transport: http() }));
const agentkit = await AgentKit.from({ walletProvider, actionProviders: [blockchainIQActionProvider({ maxPerCall: 0.01 })] });
const brief = agentkit.getActions().find((a) => a.name.endsWith("get_market_brief"));
const raw = await brief.invoke({});
if (raw.startsWith("Error")) { console.error(raw); process.exit(1); }
const out = JSON.parse(raw);
console.log(JSON.stringify(out.data, null, 2).slice(0, 1500));
console.log("settlement:", out.settlement);
