// Added by Blockchain IQ (see CHANGES.md). One command: npm run brief
// Reads the wallet from BIQ_WALLET_PRIVATE_KEY, makes exactly one paid call (0.01 USDC on Base), prints the brief.
import { createBlockchainIqBriefTool } from '../src/index.js';
import { createAdapterFromEnv, WALLET_ENV_VAR } from '../src/env-wallet.js';
try {
  const tool = createBlockchainIqBriefTool({ allowPayment: true, paymentAdapter: createAdapterFromEnv() });
  const message = await tool.invoke({ type: 'tool_call', name: tool.name, id: 'cli', args: {} });
  console.log(JSON.stringify({ brief: JSON.parse(message.content), receipt: message.artifact.receipt }, null, 2));
} catch (error) {
  console.error(error.code === 'WALLET_ENV_MISSING' ? `Set ${WALLET_ENV_VAR} to a 0x-prefixed private key of a wallet holding USDC on Base.` : (error.code ?? 'RUN_FAILED'));
  process.exitCode = 1;
}
