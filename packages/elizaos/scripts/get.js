// Added by Blockchain IQ (see CHANGES.md). Any catalogue resource from the command line:
//   npm run catalog                                     free list of resources, prices and parameters
//   npm run get -- <resource> [key=value ...]           free quote only
//   npm run get -- <resource> [key=value ...] --allow-payment   one paid call through the ElizaOS action
// The payer key is read from BIQ_X402_PRIVATE_KEY and is never printed, logged or written.
// The most one call may cost is BIQ_MAX_PRICE_USD (default 0.05).
import { pathToFileURL } from 'node:url';
import { privateKeyToAccount } from 'viem/accounts';
import { createBlockchainIqClient } from '../src/client.js';
import { createSdkPaymentAdapter } from '../src/sdk-payment.js';
import { createElizaCatalogRunner } from '../src/runner.js';

export const KEY_ENV = 'BIQ_X402_PRIVATE_KEY';

export async function main({ env = process.env, argv = process.argv.slice(2), fetchImpl = globalThis.fetch, out = s => console.log(s), err = s => console.error(s) } = {}) {
  const pay = argv.includes('--allow-payment');
  const words = argv.filter(word => !word.startsWith('--'));
  if (argv.includes('--catalog')) {
    for (const r of await createBlockchainIqClient({ fetchImpl }).catalog()) {
      const params = [...(r.requiredParams ?? []).map(p => `${p}=<required>`), ...(r.optionalParams ?? []).map(p => `[${p}=]`)].join(' ');
      out(`${r.price.padEnd(7)} ${r.resource.padEnd(32)} ${r.title}${params ? `  (${params})` : ''}`);
    }
    return 0;
  }
  const [resource, ...rest] = words;
  const params = {};
  for (const word of rest) { const at = word.indexOf('='); if (at > 0) params[word.slice(0, at)] = word.slice(at + 1); else { err('Parameters are key=value.'); return 2; } }
  if (!resource) { err('Usage: npm run get -- <resource> [key=value ...] [--allow-payment]. List resources with: npm run catalog'); return 2; }
  const maxPricePerCallUsd = env.BIQ_MAX_PRICE_USD ?? '0.05';
  try {
    if (!pay) {
      const quote = await createBlockchainIqClient({ fetchImpl }).quote(resource, params);
      out(JSON.stringify({ paymentMade: false, note: 'Quote only. Add --allow-payment to buy it.', ...quote }, null, 2));
      return 0;
    }
  } catch (e) { err(`Stopped: ${e?.code ?? 'REQUEST_FAILED'}.`); return 1; }
  const key = env[KEY_ENV];
  if (typeof key !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    err(`Set ${KEY_ENV} to a 0x-prefixed 32-byte hex private key for a wallet that holds USDC on Base. The value is not shown.`);
    return 2;
  }
  const account = privateKeyToAccount(key);
  let runner;
  try {
    runner = await createElizaCatalogRunner({
      allowPayment: true, fetchImpl, maxPricePerCallUsd, timeoutMs: 60000,
      paymentAdapter: createSdkPaymentAdapter({ address: account.address, signTypedData: v => account.signTypedData(v) }),
    });
    const { content, receipt } = await runner.run(resource, params);
    out(JSON.stringify({ paymentMade: receipt !== null, resource, receipt, content }, null, 2));
    return 0;
  } catch (e) {
    err(e?.code === 'PRICE_ABOVE_LIMIT' ? 'Stopped: PRICE_ABOVE_LIMIT. This resource costs more than BIQ_MAX_PRICE_USD; nothing was signed.'
      : `Stopped: ${e?.code ?? 'REQUEST_FAILED'}. A payment may already have been authorized; check Base before retrying.`);
    return 1;
  } finally { await runner?.stop(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
