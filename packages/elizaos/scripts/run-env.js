// Kit addition: one-command run that reads the payer key from an environment variable.
// The key is never printed, logged or written. Without --allow-one-payment this is quote-only.
import { pathToFileURL } from 'node:url';
import { privateKeyToAccount } from 'viem/accounts';
import { createBriefClient } from '../src/client.js';
import { createSdkPaymentAdapter } from '../src/sdk-payment.js';
import { createElizaBriefRunner } from '../src/runner.js';

export const KEY_ENV = 'BIQ_X402_PRIVATE_KEY';

export async function main({ env = process.env, argv = process.argv.slice(2), fetchImpl = globalThis.fetch, out = s => console.log(s), err = s => console.error(s) } = {}) {
  const pay = argv.includes('--allow-one-payment');
  if (!pay) {
    const quote = await createBriefClient({ fetchImpl }).quote();
    out(JSON.stringify({ paymentMade: false, note: 'Quote only. Add --allow-one-payment to buy one brief (0.01 USDC on Base).', quote }, null, 2));
    return 0;
  }
  const key = env[KEY_ENV];
  if (typeof key !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    err(`Set ${KEY_ENV} to a 0x-prefixed 32-byte hex private key for a wallet that holds USDC on Base. The value is not shown.`);
    return 2;
  }
  const account = privateKeyToAccount(key);
  const runner = await createElizaBriefRunner({
    allowPayment: true, fetchImpl,
    paymentAdapter: createSdkPaymentAdapter({ address: account.address, signTypedData: v => account.signTypedData(v) }),
  });
  try {
    const { content, receipt } = await runner.run();
    out(JSON.stringify({ paymentMade: true, receipt, brief: content }, null, 2));
    return 0;
  } catch (e) {
    err(`Stopped: ${e?.code ?? 'REQUEST_FAILED'}. A payment may already have been authorized; check Base before retrying.`);
    return 1;
  } finally { await runner.stop(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
