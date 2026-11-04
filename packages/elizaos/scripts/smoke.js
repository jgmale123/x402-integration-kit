import { privateKeyToAccount } from 'viem/accounts';
import { createSdkPaymentAdapter } from '../src/sdk-payment.js';
import { createElizaBriefRunner } from '../src/runner.js';
import { mockTransport, paid } from '../test/fixtures.js';
const account = privateKeyToAccount('0x' + '11'.repeat(32)); // Public, synthetic, never fund.
const transport = mockTransport({ second: () => paid({ receipt: { payer: account.address } }) });
const runner = await createElizaBriefRunner({ allowPayment: true, fetchImpl: transport.fetchImpl, paymentAdapter: createSdkPaymentAdapter({ address: account.address, signTypedData: value => account.signTypedData(value) }) });
try {
  const result = await runner.run();
  console.log(JSON.stringify({ framework: 'ElizaOS1.7.2', nativeRuntimeActionExecuted: runner.getAudit().events.length === 1, syntheticReceiptSuccess: result.receipt.success, httpFixtureCalls: transport.calls.length, realNetworkCalls: 0, realPaidCall: false, claimSubmitted: false }));
} finally { await runner.stop(); }
