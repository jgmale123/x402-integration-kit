// Free: reads the server's price and signs nothing.
//   npm run quote                      the market brief
//   npm run quote -- research coin=bitcoin   any catalogue resource, with its parameters as key=value
//   npm run quote -- --all             every resource in the catalogue (path parameters use catalogue examples where given)
import { createBriefClient, createBlockchainIqClient, POLICY } from '../src/index.js';
import { parseArgs } from './args.js';
try {
  const [id, ...rest] = process.argv.slice(2);
  if (!id) {
    const quote = await createBriefClient().quote();
    console.log(JSON.stringify({ mode: 'UNPAID QUOTE ONLY', endpoint: POLICY.url, quote,
      signing: false, paidCalls: 0, awardQualification: false }, null, 2));
  } else if (id === '--all') {
    const client = createBlockchainIqClient({ timeoutMs: 60000 });
    const rows = [];
    for (const entry of await client.catalog()) {
      if (entry.requiredParams) { rows.push({ resource: entry.resource, catalogue: entry.price, quoted: 'needs ' + entry.requiredParams.join(', ') }); continue; }
      try { rows.push({ resource: entry.resource, catalogue: entry.price, quoted: (await client.quote(entry.resource)).price }); }
      catch (error) { rows.push({ resource: entry.resource, catalogue: entry.price, quoted: 'FAILED ' + (error.code ?? 'QUOTE_FAILED') }); }
    }
    console.log(JSON.stringify({ mode: 'UNPAID QUOTES ONLY', signing: false, paidCalls: 0, rows }, null, 2));
  } else {
    const result = await createBlockchainIqClient().quote(id, parseArgs(rest));
    console.log(JSON.stringify({ mode: 'UNPAID QUOTE ONLY', signing: false, paidCalls: 0, ...result }, null, 2));
  }
} catch (error) { console.error(error.code ?? 'QUOTE_FAILED'); process.exitCode = 1; }
