// Added by Blockchain IQ (see CHANGES.md). Builds a payment adapter from a private key held in an
// environment variable. The key is read once, never logged, never included in an error message.
import { privateKeyToAccount } from 'viem/accounts';
import { BriefError, fail } from './policy.js';
import { createSdkPaymentAdapter } from './sdk-payment.js';

export const WALLET_ENV_VAR = 'BIQ_WALLET_PRIVATE_KEY';

export function createAdapterFromEnv(env = process.env) {
  const key = env[WALLET_ENV_VAR];
  if (typeof key !== 'string' || key === '') fail('WALLET_ENV_MISSING');
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) fail('WALLET_ENV_INVALID');
  try {
    const account = privateKeyToAccount(key);
    return createSdkPaymentAdapter({ address: account.address, signTypedData: data => account.signTypedData(data) });
  } catch (error) {
    if (error instanceof BriefError) throw error;
    fail('WALLET_ENV_INVALID');
  }
}
