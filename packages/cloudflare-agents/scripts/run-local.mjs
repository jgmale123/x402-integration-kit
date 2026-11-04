// Kit addition: one-command local run. Reads the wallet key and invocation token
// from environment variables, writes them to the git-ignored .dev.vars file that
// wrangler reads, and starts the local Worker. Nothing is printed or hardcoded.
import { writeFileSync, chmodSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const key = process.env.PROJECT_EVM_PRIVATE_KEY;
const token = process.env.INVOCATION_TOKEN;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("Set PROJECT_EVM_PRIVATE_KEY to the 0x-prefixed key of a dedicated throwaway Base wallet that holds at least 0.05 USDC.");
  process.exit(1);
}
if (!token || token.length < 32) {
  console.error("Set INVOCATION_TOKEN to a random string of at least 32 characters.");
  process.exit(1);
}
const file = new URL("../.dev.vars", import.meta.url);
writeFileSync(file, `INVOCATION_TOKEN=${token}\nPROJECT_EVM_PRIVATE_KEY=${key}\n`, { mode: 0o600 });
try { chmodSync(file, 0o600); } catch {}
console.error("Starting the local Worker on http://127.0.0.1:8787 (.dev.vars written; it is git-ignored).");
const child = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--local", "--ip", "127.0.0.1"], { cwd: root, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
