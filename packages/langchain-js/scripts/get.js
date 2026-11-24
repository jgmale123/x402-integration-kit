// Added by Blockchain IQ (see CHANGES.md). One paid call to any catalogue resource:
//   npm run get -- <resource> [key=value ...]
// Reads the wallet from BIQ_WALLET_PRIVATE_KEY. The most it may pay is BIQ_MAX_PRICE_USD (default 0.05);
// a resource priced above that is refused before any payment is signed.
import { createBlockchainIqTools } from '../src/index.js';
import { createAdapterFromEnv, WALLET_ENV_VAR } from '../src/env-wallet.js';
import { parseArgs } from './args.js';
try {
  const [id, ...rest] = process.argv.slice(2);
  if (!id) { console.error('Usage: npm run get -- <resource> [key=value ...]. List resources with: npm run catalog'); process.exit(1); }
  const [, getTool] = createBlockchainIqTools({ allowPayment: true, paymentAdapter: createAdapterFromEnv(),
    maxPricePerCallUsd: process.env.BIQ_MAX_PRICE_USD ?? '0.05', timeoutMs: 60000 });
  const message = await getTool.invoke({ type: 'tool_call', name: getTool.name, id: 'cli', args: { resource: id, params: parseArgs(rest) } });
  console.log(JSON.stringify({ resource: id, content: JSON.parse(message.content), receipt: message.artifact.receipt, payment: message.artifact.payment }, null, 2));
} catch (error) {
  console.error(error.code === 'WALLET_ENV_MISSING' ? `Set ${WALLET_ENV_VAR} to a 0x-prefixed private key of a wallet holding USDC on Base.`
    : error.code === 'PRICE_ABOVE_LIMIT' ? 'PRICE_ABOVE_LIMIT: this resource costs more than BIQ_MAX_PRICE_USD. Raise it deliberately to buy it.' : (error.code ?? 'RUN_FAILED'));
  process.exitCode = 1;
}
