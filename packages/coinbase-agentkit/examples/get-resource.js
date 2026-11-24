// Added by Blockchain IQ (see CHANGES.md). Any catalogue resource through the AgentKit action provider.
//   node examples/get-resource.js --list                      free: every resource with its price
//   AGENT_PRIVATE_KEY=0x... node examples/get-resource.js research coin=bitcoin     one real paid call
// The most one call may cost is BIQ_MAX_PRICE_USD (default 0.05). The key is never printed.
import { AgentKit, ViemWalletProvider } from "@coinbase/agentkit";
import { createWalletClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { blockchainIQActionProvider } from "../src/index.js";

// AgentKit's wallet-provider init fires an un-awaited analytics request; if that
// request fails it surfaces as an unhandled rejection and kills Node. Ignore only that.
process.on("unhandledRejection", (e) => {
  if (String(e?.stack ?? e).includes("sendAnalyticsEvent")) return;
  console.error(e); process.exit(1);
});

const words = process.argv.slice(2);
const listOnly = words.includes("--list") || words.length === 0;
const key = process.env.AGENT_PRIVATE_KEY;
if (!listOnly && !/^0x[0-9a-fA-F]{64}$/.test(key ?? "")) {
  console.error("Set AGENT_PRIVATE_KEY to a 0x-prefixed private key of a wallet holding USDC on Base. The value is not shown.");
  process.exit(2);
}
// Listing signs nothing, so a throwaway key that never holds funds is enough to build the provider.
const account = privateKeyToAccount(listOnly ? generatePrivateKey() : key);
const walletProvider = new ViemWalletProvider(createWalletClient({ account, chain: base, transport: http() }));
const agentkit = await AgentKit.from({ walletProvider,
  actionProviders: [blockchainIQActionProvider({ maxPerCall: Number(process.env.BIQ_MAX_PRICE_USD ?? 0.05) })] });
const action = (suffix) => agentkit.getActions().find((a) => a.name.endsWith(suffix));

if (listOnly) {
  const raw = await action("list_resources").invoke({});
  if (raw.startsWith("Error")) { console.error(raw); process.exit(1); }
  for (const r of JSON.parse(raw)) {
    const params = [...(r.requiredParams ?? []).map((p) => `${p}=<required>`), ...(r.optionalParams ?? []).map((p) => `[${p}=]`)].join(" ");
    console.log(`${r.price.padEnd(7)} ${r.resource.padEnd(32)} ${r.title}${params ? `  (${params})` : ""}`);
  }
  process.exit(0);
}
const [resource, ...rest] = words;
const params = Object.fromEntries(rest.map((w) => [w.slice(0, w.indexOf("=")), w.slice(w.indexOf("=") + 1)]));
const raw = await action("get_resource").invoke({ resource, params });
if (raw.startsWith("Error")) { console.error(raw); process.exit(1); }
const out = JSON.parse(raw);
console.log(JSON.stringify(out.data, null, 2).slice(0, 1500));
console.log("price:", out.price, "settlement:", out.settlement);
process.exit(0);
