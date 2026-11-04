import test from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { main, KEY_ENV } from '../scripts/run-env.js';
import { CONTENT, mockTransport, paid, paymentRequired } from './fixtures.js';

const KEY = '0x' + '11'.repeat(32); // Public synthetic test key from the upstream tests. Never fund.
const account = privateKeyToAccount(KEY);
const capture = () => { const lines = []; return { lines, out: s => lines.push(s), err: s => lines.push(s) }; };

test('quote-only by default: no key needed, no payment', async () => {
  const t = mockTransport(); const c = capture();
  assert.equal(await main({ env: {}, argv: [], fetchImpl: t.fetchImpl, ...c }), 0);
  assert.equal(JSON.parse(c.lines[0]).paymentMade, false); assert.equal(t.calls.length, 1);
});
test('payment flag without the env var fails and does not call the network', async () => {
  const t = mockTransport(); const c = capture();
  assert.equal(await main({ env: {}, argv: ['--allow-one-payment'], fetchImpl: t.fetchImpl, ...c }), 2);
  assert.equal(t.calls.length, 0); assert.match(c.lines[0], new RegExp(KEY_ENV));
});
test('malformed key is rejected and never echoed', async () => {
  const c = capture();
  assert.equal(await main({ env: { [KEY_ENV]: 'secret-not-hex' }, argv: ['--allow-one-payment'], fetchImpl: mockTransport().fetchImpl, ...c }), 2);
  assert.ok(!c.lines.join('\n').includes('secret-not-hex'));
});
test('success path (mocked): returns brief and receipt, never prints the key', async () => {
  const t = mockTransport({ second: () => paid({ receipt: { payer: account.address } }) }); const c = capture();
  assert.equal(await main({ env: { [KEY_ENV]: KEY }, argv: ['--allow-one-payment'], fetchImpl: t.fetchImpl, ...c }), 0);
  const o = JSON.parse(c.lines[0]); assert.equal(o.paymentMade, true); assert.deepEqual(o.brief, CONTENT);
  assert.ok(!c.lines.join('\n').includes('1'.repeat(64))); assert.equal(t.calls.length, 2);
});
test('HTTP error on the paid request: exit 1, no retry', async () => {
  const t = mockTransport({ second: () => new Response('{}', { status: 500 }) }); const c = capture();
  assert.equal(await main({ env: { [KEY_ENV]: KEY }, argv: ['--allow-one-payment'], fetchImpl: t.fetchImpl, ...c }), 1);
  assert.match(c.lines[0], /PAID_REQUEST_FAILED_NO_RETRY/); assert.equal(t.calls.length, 2);
});
test('malformed paid body: exit 1', async () => {
  const t = mockTransport({ second: () => paid({ receipt: { payer: account.address }, content: { source: 'attacker' } }) }); const c = capture();
  assert.equal(await main({ env: { [KEY_ENV]: KEY }, argv: ['--allow-one-payment'], fetchImpl: t.fetchImpl, ...c }), 1);
  assert.match(c.lines[0], /INVALID_BRIEF/);
});
test('402 challenge with wrong payee: refused before signing', async () => {
  const bad = { x402Version: 2, resource: { url: 'https://www.blockchainiq.co/api/x402/v1/brief', mimeType: 'application/json' }, accepts: [{ scheme: 'exact', network: 'eip155:8453', amount: '10000', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', payTo: '0x2222222222222222222222222222222222222222', maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' } }] };
  const t = mockTransport({ challenge: bad }); const c = capture();
  assert.equal(await main({ env: { [KEY_ENV]: KEY }, argv: ['--allow-one-payment'], fetchImpl: t.fetchImpl, ...c }), 1);
  assert.match(c.lines[0], /UNSAFE_PAYMENT_QUOTE/);
});
