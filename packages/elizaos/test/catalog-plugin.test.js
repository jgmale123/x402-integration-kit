// Added by Blockchain IQ. Offline: mocked fetch and the public synthetic key; no network, no real key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodePaymentRequiredHeader } from '@x402/core/http';
import { privateKeyToAccount } from 'viem/accounts';
import { createBlockchainIqCatalogPlugin, createBlockchainIqClient, createSdkPaymentAdapter, GET_ACTION_NAME, POLICY } from '../src/index.js';
import { createElizaCatalogRunner } from '../src/runner.js';
import { main, KEY_ENV } from '../scripts/get.js';
import { paid } from './fixtures.js';

const KEY = '0x' + '11'.repeat(32); // Public synthetic fixture only. Never fund this account.
const account = privateKeyToAccount(KEY);
const adapter = () => createSdkPaymentAdapter({ address: account.address, signTypedData: data => account.signTypedData(data) });
const BASE = 'https://www.blockchainiq.co/api/x402/v1';
const envelope = { source: 'Blockchain IQ', disclaimer: 'Synthetic fixture.', terms: 'https://www.blockchainiq.co/terms' };
const CATALOG = { ...envelope, data: [
  { id: 'sample', method: 'GET', path: '/api/x402/v1/sample', price: 'free', title: 'Sample' },
  { id: 'brief', method: 'GET', path: '/api/x402/v1/brief', price: '$0.01', title: 'Market brief' },
  { id: 'event-risk', method: 'GET', path: '/api/x402/v1/event-risk', price: '$0.05', title: 'Event risk',
    discovery: { inputSchema: { type: 'object', properties: { days: { type: 'integer' } } } } },
  { id: 'research', method: 'GET', path: '/api/x402/v1/research/{coin}', price: '$0.05', title: 'Research' },
  { id: 'analyst-pack', method: 'GET', path: '/api/x402/v1/analyst-pack', price: '$2.00', title: 'Analyst pack' },
] };
const AMOUNTS = { brief: '10000', 'event-risk': '50000', research: '50000', 'analyst-pack': '2000000' };
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
function transport() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url === BASE) return json(CATALOG);
    if (url === `${BASE}/sample`) return json({ ...envelope, data: { free: true } });
    if (init.headers['PAYMENT-SIGNATURE']) return paid({ receipt: { payer: account.address }, content: { ...envelope, data: { url, secret: 'PRIVATE_DATA_SENTINEL' } } });
    const amount = AMOUNTS[Object.keys(AMOUNTS).find(k => url.includes(k))];
    return json({}, 402, { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader({ x402Version: 2, resource: { url, mimeType: 'application/json' }, accepts: [
      { scheme: 'exact', network: POLICY.network, amount, asset: POLICY.asset, payTo: POLICY.payTo, maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' } },
      { scheme: 'exact', network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', amount, asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        payTo: '473o2o4QaubXvvAFr9jikTCEirA6xhpzMSBxJpbTocLf', maxTimeoutSeconds: 300, extra: { feePayer: 'BENrLoUbndxoNMUS5JXApGMtNykLjFXXixMtpDwDR9SP' } }] }) });
  };
  return { calls, fetchImpl };
}
const capture = () => { const lines = []; return { lines, out: s => lines.push(s), err: s => lines.push(s) }; };

test('real AgentRuntime dispatches the catalogue action, buys two resources within limits and keeps data out of framework records', async t => {
  const tr = transport();
  const runner = await createElizaCatalogRunner({ paymentAdapter: adapter(), allowPayment: true, fetchImpl: tr.fetchImpl, maxPayments: 2, maxTotalUsd: '0.10' });
  t.after(() => runner.stop());
  assert.equal(runner.plugin.actions[0].name, GET_ACTION_NAME);
  const first = await runner.run('research', { coin: 'bitcoin' });
  assert.equal(first.resource, 'research'); assert.equal(first.content.data.url, `${BASE}/research/bitcoin`); assert.equal(first.receipt.payer, account.address);
  const second = await runner.run('event-risk', { days: 7 });
  assert.equal(second.content.data.url, `${BASE}/event-risk?days=7`);
  assert.deepEqual(runner.getBudget(), { reservedUnits: '100000', maxUnits: '100000', authorizations: 2, remainingAuthorizations: 0 });
  await assert.rejects(runner.run('brief'), /PAYMENT_BUDGET_EXHAUSTED/);
  const serialized = JSON.stringify(runner.getAudit());
  assert.equal(serialized.includes('PRIVATE_DATA_SENTINEL'), false); assert.equal(serialized.includes('PAYMENT-SIGNATURE'), false);
});

test('a resource above the per-call limit, outside the allow-list or unknown is refused with nothing signed', async t => {
  const tr = transport(); let signed = 0;
  const runner = await createElizaCatalogRunner({ allowPayment: true, fetchImpl: tr.fetchImpl, allowedResources: ['brief', 'analyst-pack'],
    paymentAdapter: createSdkPaymentAdapter({ address: account.address, signTypedData: async v => { signed++; return account.signTypedData(v); } }) });
  t.after(() => runner.stop());
  await assert.rejects(runner.run('analyst-pack'), /PRICE_ABOVE_LIMIT/);
  await assert.rejects(runner.run('research', { coin: 'bitcoin' }), /RESOURCE_NOT_ALLOWED/);
  await assert.rejects(runner.run('../brief'), /RESOURCE_NOT_ALLOWED/);
  assert.equal(signed, 0); assert.equal(runner.getBudget().authorizations, 0);
  assert.ok(tr.calls.every(c => c.url === BASE));
});

test('payment-disabled catalogue runner stops without any network or signer call', async t => {
  let calls = 0;
  const runner = await createElizaCatalogRunner({ fetchImpl: () => { calls++; throw Error('must not run'); } });
  t.after(() => runner.stop());
  await assert.rejects(runner.run('brief'), /OWNER_AUTHORIZATION_REQUIRED/);
  assert.equal(calls, 0);
});

test('only the configured operator can trigger the action, and payment needs a private consumer', async () => {
  assert.throws(() => createBlockchainIqCatalogPlugin({ allowPayment: true, paymentAdapter: adapter(), ownerEntityId: '00000000-0000-0000-0000-000000000001' }), /INVALID_PRIVATE_CONSUMER/);
  assert.throws(() => createBlockchainIqCatalogPlugin({ allowedResources: ['Bad Id'] }), /INVALID_OPTIONS/);
  const tr = transport(); let delivered = 0;
  const plugin = createBlockchainIqCatalogPlugin({ allowPayment: true, paymentAdapter: adapter(), fetchImpl: tr.fetchImpl,
    ownerEntityId: '00000000-0000-0000-0000-000000000001', onResult: () => { delivered++; } });
  const stranger = { entityId: '00000000-0000-0000-0000-000000000002', content: { resource: 'brief' } };
  assert.equal(await plugin.actions[0].validate({}, stranger), false);
  const result = await plugin.actions[0].handler({}, stranger);
  assert.equal(result.data.code, 'OWNER_AUTHORIZATION_REQUIRED'); assert.equal(delivered, 0); assert.equal(tr.calls.length, 0);
});

test('the free sample is read through the client without a wallet', async () => {
  const result = await createBlockchainIqClient(transport()).get('sample');
  assert.equal(result.receipt, null); assert.equal(result.content.data.free, true);
});

test('command line: catalogue and quote are free; payment needs the flag and the key; the key is never printed', async () => {
  let c = capture();
  assert.equal(await main({ env: {}, argv: ['--catalog'], fetchImpl: transport().fetchImpl, ...c }), 0);
  assert.equal(c.lines.length, 5); assert.match(c.lines[3], /research.*coin=<required>/);
  c = capture(); let tr = transport();
  assert.equal(await main({ env: {}, argv: ['event-risk', 'days=7'], fetchImpl: tr.fetchImpl, ...c }), 0);
  assert.equal(JSON.parse(c.lines[0]).paymentMade, false); assert.equal(JSON.parse(c.lines[0]).price, '$0.05');
  c = capture(); tr = transport();
  assert.equal(await main({ env: {}, argv: ['brief', '--allow-payment'], fetchImpl: tr.fetchImpl, ...c }), 2);
  assert.match(c.lines[0], new RegExp(KEY_ENV)); assert.equal(tr.calls.length, 0);
  c = capture(); tr = transport();
  assert.equal(await main({ env: { [KEY_ENV]: KEY }, argv: ['brief', '--allow-payment'], fetchImpl: tr.fetchImpl, ...c }), 0);
  const o = JSON.parse(c.lines[0]); assert.equal(o.paymentMade, true); assert.equal(o.receipt.payer, account.address);
  assert.ok(!c.lines.join('\n').includes('1'.repeat(64)));
  c = capture();
  assert.equal(await main({ env: { [KEY_ENV]: KEY }, argv: ['analyst-pack', '--allow-payment'], fetchImpl: transport().fetchImpl, ...c }), 1);
  assert.match(c.lines[0], /PRICE_ABOVE_LIMIT/);
  c = capture();
  assert.equal(await main({ env: { [KEY_ENV]: KEY, BIQ_MAX_PRICE_USD: '2.00' }, argv: ['analyst-pack', '--allow-payment'], fetchImpl: transport().fetchImpl, ...c }), 0);
});
