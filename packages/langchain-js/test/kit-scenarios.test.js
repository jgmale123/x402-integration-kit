// Added by Blockchain IQ. Offline: mocked fetch and a synthetic signature; no network, no real key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriefClient, createSdkPaymentAdapter } from '../src/index.js';
import { createAdapterFromEnv, WALLET_ENV_VAR } from '../src/env-wallet.js';
import { ADDRESS, CONTENT, SIGNATURE, mockTransport, paid } from './fixtures.js';

const adapter = () => createSdkPaymentAdapter({ address: ADDRESS, signTypedData: async () => SIGNATURE });
const client = t => createBriefClient({ ...t, allowPayment: true, paymentAdapter: adapter() });
const code = p => assert.rejects(p, e => { code.last = e.code; return true; });

test('success: 402 challenge then paid 200 returns the brief and receipt', async () => {
  const r = await client(mockTransport()).run();
  assert.deepEqual(r.content, CONTENT);
  assert.equal(r.receipt.success, true);
});
test('402 challenge: unpaid quote reads the challenge and signs nothing', async () => {
  const t = mockTransport();
  const q = await createBriefClient(t).quote();
  assert.equal(q.accepts[0].amount, '10000');
  assert.equal(t.calls.length, 1);
});
test('HTTP error: a 500 after the challenge fails without a retry', async () => {
  const t = mockTransport({ second: () => new Response('{}', { status: 500 }) });
  await code(client(t).run());
  assert.equal(code.last, 'PAID_REQUEST_FAILED_NO_RETRY');
  assert.equal(t.calls.length, 2);
});
test('malformed body: non-JSON paid body is rejected', async () => {
  const t = mockTransport({ second: () => { const ok = paid(); return new Response('not json', { status: 200, headers: ok.headers }); } });
  await code(client(t).run());
  assert.equal(code.last, 'INVALID_RESPONSE');
});
test('malformed body: JSON that is not a Blockchain IQ brief is rejected', async () => {
  const t = mockTransport({ second: () => paid({ content: { source: 'other' } }) });
  await code(client(t).run());
  assert.equal(code.last, 'INVALID_BRIEF');
});
test('env wallet: missing and malformed variable fail without echoing the value', () => {
  assert.throws(() => createAdapterFromEnv({}), e => e.code === 'WALLET_ENV_MISSING');
  const bad = 'not-a-key-value';
  assert.throws(() => createAdapterFromEnv({ [WALLET_ENV_VAR]: bad }), e => e.code === 'WALLET_ENV_INVALID' && !String(e.message).includes(bad));
});
