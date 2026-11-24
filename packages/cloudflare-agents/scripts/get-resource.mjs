// Added by Blockchain IQ: one-command run of the any-resource route. Builds the Worker, runs it in the local
// workerd runtime inside this process, makes one request to it, prints the answer and exits. Real calls go to
// https://www.blockchainiq.co. The wallet key is read from PROJECT_EVM_PRIVATE_KEY and is never printed.
//
//   node scripts/get-resource.mjs                          free: list every resource and price
//   node scripts/get-resource.mjs sample                   free resource
//   node scripts/get-resource.mjs brief                    shows the price; nothing is signed without --pay
//   node scripts/get-resource.mjs brief --pay              pays the catalogue price ($0.01)
//   node scripts/get-resource.mjs network chain=base --pay
//
// Limits come from MAX_PRICE_PER_CALL_USD (default 0.05), MAX_PAYMENTS (default 1) and MAX_TOTAL_USD.
// This local run starts with an empty ledger each time; a deployed Worker keeps its ledger.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { generatePrivateKey } from "viem/accounts";

const args = process.argv.slice(2).filter((a) => a !== "--pay");
const pay = process.argv.includes("--pay");
let key = process.env.PROJECT_EVM_PRIVATE_KEY;
if (pay && (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))) {
  console.error("Set PROJECT_EVM_PRIVATE_KEY to the 0x-prefixed key of a dedicated Base wallet that holds a little USDC.");
  process.exit(1);
}
if (!pay) key = generatePrivateKey(); // nothing is signed without --pay; the Worker only needs a well-formed key
const params = {};
for (const pair of args.slice(1)) {
  const at = pair.indexOf("=");
  if (at < 1) { console.error(`Parameters are name=value; got ${pair}`); process.exit(1); }
  params[pair.slice(0, at)] = pair.slice(at + 1);
}
const bindings = { INVOCATION_TOKEN: randomBytes(32).toString("hex"), PROJECT_EVM_PRIVATE_KEY: key };
for (const name of ["MAX_PRICE_PER_CALL_USD", "MAX_PAYMENTS", "MAX_TOTAL_USD"]) if (process.env[name] !== undefined) bindings[name] = process.env[name];

const root = fileURLToPath(new URL("../", import.meta.url));
execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "deploy", "--dry-run", "--outdir", ".wrangler-dry-run"], { cwd: root, stdio: "pipe", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, scriptPath: fileURLToPath(new URL("../.wrangler-dry-run/index.js", import.meta.url)),
  compatibilityDate: "2026-10-25", compatibilityFlags: ["nodejs_compat"],
  durableObjects: { AGENT: { className: "BlockchainIqAgent", useSQLite: true } },
  durableObjectsPersist: false, bindings,
}));
const headers = { authorization: `Bearer ${bindings.INVOCATION_TOKEN}`, "Content-Type": "application/json" };
try {
  if (!args.length) {
    const { resources } = await (await mf.dispatchFetch("http://local.test/catalog", { headers })).json();
    for (const r of resources) console.log(`${r.price.padStart(7)}  ${r.resource.padEnd(32)} ${r.title}`);
  } else {
    const response = await mf.dispatchFetch("http://local.test/resource", { method: "POST", headers, body: JSON.stringify({ resource: args[0], params, ...(pay ? { confirmPayment: true } : {}) }) });
    const body = await response.json();
    console.log(`HTTP ${response.status}`);
    console.log(JSON.stringify({ ...body, paymentResponse: undefined }, null, 1).slice(0, 2500));
    if (body.evidence?.transaction) console.log(`https://basescan.org/tx/${body.evidence.transaction}`);
    if (pay) console.log("ledger:", JSON.stringify(await (await mf.dispatchFetch("http://local.test/ledger", { headers })).json()).slice(0, 1200));
    process.exitCode = response.ok ? 0 : 1;
  }
} finally { await mf.dispose(); }
