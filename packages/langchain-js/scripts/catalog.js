// Added by Blockchain IQ. Free: prints every resource with its price and parameters. Signs nothing.
import { createBlockchainIqClient } from '../src/index.js';
try {
  for (const r of await createBlockchainIqClient().catalog()) {
    const params = [...(r.requiredParams ?? []).map(p => `${p}=<required>`), ...(r.optionalParams ?? []).map(p => `[${p}=]`)].join(' ');
    console.log(`${r.price.padEnd(7)} ${r.resource.padEnd(32)} ${r.title}${params ? `  (${params})` : ''}`);
  }
} catch (error) { console.error(error.code ?? 'CATALOG_FAILED'); process.exitCode = 1; }
