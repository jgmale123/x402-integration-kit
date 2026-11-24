// Added by Blockchain IQ. Offline: mocked fetch and a synthetic signature; no network, no real key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodePaymentRequiredHeader } from '@x402/core/http';
import { buildUrl, createBlockchainIqClient, createBlockchainIqTools, createSdkPaymentAdapter, parseCatalog, POLICY } from '../src/index.js';
import { validatePaymentRequired } from '../src/policy.js';
import { ADDRESS, SIGNATURE, paid } from './fixtures.js';

const BASE = 'https://www.blockchainiq.co/api/x402/v1';
const envelope = { source: 'Blockchain IQ', disclaimer: 'Synthetic fixture.', terms: 'https://www.blockchainiq.co/terms' };
const CATALOG = { ...envelope, data: [
  { id: 'catalog', method: 'GET', path: '/api/x402/v1', price: 'free', title: 'Catalog' },
  { id: 'sample', method: 'GET', path: '/api/x402/v1/sample', price: 'free', title: 'Sample' },
  { id: 'brief', method: 'GET', path: '/api/x402/v1/brief', price: '$0.01', title: 'Market brief' },
  { id: 'event-risk', method: 'GET', path: '/api/x402/v1/event-risk', price: '$0.05', title: 'Event risk',
    discovery: { inputSchema: { type: 'object', properties: { days: { type: 'integer' }, minImportance: { type: 'integer' } } } } },
  { id: 'research', method: 'GET', path: '/api/x402/v1/research/{coin}', price: '$0.05', title: 'Research' },
  { id: 'analyst-pack', method: 'GET', path: '/api/x402/v1/analyst-pack', price: '$2.00', title: 'Analyst pack' },
  { id: 'cardano-history', method: 'GET', path: '/api/x402/v1/cardano/history', price: '$15.00', title: 'Cardano history' },
  { id: 'evil', method: 'GET', path: '//attacker.invalid/api/x402/v1/x', price: '$0.01', title: 'Bad path' },
  { id: 'post-only', method: 'POST', path: '/api/x402/v1/post', price: '$0.01', title: 'Wrong method' },
] };
const PRICES = { brief: '10000', 'event-risk': '50000', research: '50000', 'analyst-pack': '2000000', history: '15000000' };
const solana = amount => ({ scheme: 'exact', network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', amount,
  asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', payTo: '473o2o4QaubXvvAFr9jikTCEirA6xhpzMSBxJpbTocLf',
  maxTimeoutSeconds: 300, extra: { feePayer: 'BENrLoUbndxoNMUS5JXApGMtNykLjFXXixMtpDwDR9SP' } });
const challenge = (url, amount) => ({ x402Version: 2, resource: { url, mimeType: 'application/json' }, extensions: { bazaar: { info: 'ignored' } },
  accepts: [{ scheme: 'exact', network: POLICY.network, amount, asset: POLICY.asset, payTo: POLICY.payTo,
    maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' } }, solana(amount)] });
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function transport({ amountFor = url => PRICES[Object.keys(PRICES).find(k => url.includes(k))], mutate = q => q } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url === BASE) return json(CATALOG);
    if (url === `${BASE}/sample`) return json({ ...envelope, data: { free: true } });
    if (init.headers['PAYMENT-SIGNATURE']) return paid({ content: { ...envelope, data: { url } } });
    return json({}, 402, { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(mutate(challenge(url, amountFor(url)))) });
  };
  return { calls, fetchImpl };
}
const signer = (callback = async () => SIGNATURE) => createSdkPaymentAdapter({ address: ADDRESS, signTypedData: callback });
const paying = (t, options = {}) => createBlockchainIqClient({ ...t, allowPayment: true, paymentAdapter: signer(), ...options });
const expectCode = (promise, code) => assert.rejects(promise, error => error.code === code && error.message === code);

test('catalog lists well-formed GET resources only, with prices and parameters', async () => {
  const list = await createBlockchainIqClient(transport()).catalog();
  assert.deepEqual(list.map(r => r.resource), ['sample', 'brief', 'event-risk', 'research', 'analyst-pack', 'cardano-history']);
  assert.deepEqual(list.find(r => r.resource === 'research').requiredParams, ['coin']);
  assert.deepEqual(list.find(r => r.resource === 'event-risk').optionalParams, ['days', 'minImportance']);
});

test('a two-rail quote (Base and Solana) is accepted and only the Base option is kept', async () => {
  const q = await createBlockchainIqClient(transport()).quote('event-risk', { days: 7 });
  assert.equal(q.price, '$0.05'); assert.equal(q.url, `${BASE}/event-risk?days=7`);
  assert.equal(q.quote.accepts.length, 1); assert.equal(q.quote.accepts[0].network, POLICY.network);
});

test('default limits buy a five-cent resource once, at the URL built from the parameters', async () => {
  const t = transport(); const client = paying(t);
  const result = await client.get('research', { coin: 'bitcoin' });
  assert.equal(result.content.data.url, `${BASE}/research/bitcoin`); assert.equal(result.receipt.success, true);
  assert.deepEqual(client.getBudget(), { reservedUnits: '50000', maxUnits: '50000', authorizations: 1, remainingAuthorizations: 0 });
  await expectCode(client.get('brief'), 'PAYMENT_BUDGET_EXHAUSTED');
});

test('free resources are read without a wallet and without touching the budget', async () => {
  const client = createBlockchainIqClient(transport());
  const result = await client.get('sample');
  assert.equal(result.receipt, null); assert.equal(result.content.data.free, true); assert.equal(client.getBudget().authorizations, 0);
});

test('payment stays off by default: a paid resource stops at PAYMENT_DISABLED and never signs', async () => {
  let calls = 0; const client = createBlockchainIqClient({ ...transport(), paymentAdapter: signer(async () => { calls++; return SIGNATURE; }) });
  await expectCode(client.get('brief'), 'PAYMENT_DISABLED'); assert.equal(calls, 0);
});

test('a resource priced above the per-call limit is refused before any request to it', async () => {
  const t = transport(); const client = paying(t);
  await expectCode(client.get('analyst-pack'), 'PRICE_ABOVE_LIMIT');
  await expectCode(client.get('cardano-history'), 'PRICE_ABOVE_LIMIT');
  assert.deepEqual(t.calls.map(c => c.url), [BASE]); assert.equal(client.getBudget().authorizations, 0);
});

test('the owner can raise the limit deliberately to buy a dollar-priced resource', async () => {
  const client = paying(transport(), { maxPricePerCallUsd: '15.00' });
  const result = await client.get('cardano-history');
  assert.equal(result.payment.reservedUnits, '15000000');
});

test('a server quote above the catalogue price and above the limit is refused unsigned', async () => {
  let calls = 0;
  const client = createBlockchainIqClient({ ...transport({ amountFor: () => '60000' }), allowPayment: true,
    paymentAdapter: signer(async () => { calls++; return SIGNATURE; }) });
  await expectCode(client.get('brief'), 'UNSAFE_PAYMENT_QUOTE'); assert.equal(calls, 0); assert.equal(client.getBudget().authorizations, 0);
});

test('several payments stop at the total and at the payment count', async () => {
  const client = paying(transport(), { maxPayments: 3, maxTotalUsd: '0.07' });
  await client.get('brief'); await client.get('event-risk');
  await expectCode(client.get('event-risk'), 'PAYMENT_BUDGET_EXHAUSTED');
  await client.get('brief');
  await expectCode(client.get('brief'), 'PAYMENT_BUDGET_EXHAUSTED');
  assert.equal(client.getBudget().reservedUnits, '70000');
});

test('unknown resources, unknown parameters and unsafe path values make no paid request', async () => {
  const t = transport(); const client = paying(t);
  await expectCode(client.get('nope'), 'UNKNOWN_RESOURCE');
  await expectCode(client.get('evil'), 'UNKNOWN_RESOURCE');
  await expectCode(client.get('post-only'), 'UNKNOWN_RESOURCE');
  await expectCode(client.get('catalog'), 'UNKNOWN_RESOURCE');
  await expectCode(client.get('brief', { url: 'https://attacker.invalid' }), 'INVALID_PARAMS');
  await expectCode(client.get('research'), 'INVALID_PARAMS');
  for (const coin of ['../brief', 'a/b', 'a?b=c', 'a#b', '', '%2e%2e', 'x'.repeat(200)]) await expectCode(client.get('research', { coin }), 'INVALID_PARAMS');
  assert.ok(t.calls.every(c => c.url === BASE));
});

test('altered Base options are refused even when a second rail is present', async () => {
  const attacks = {
    'wrong recipient': q => { q.accepts[0].payTo = ADDRESS; },
    'wrong token': q => { q.accepts[0].asset = ADDRESS; },
    'two Base options': q => { q.accepts.push(structuredClone(q.accepts[0])); },
    'no Base option': q => { q.accepts.shift(); },
    'other URL': q => { q.resource.url += '?x=1'; },
    'permit2': q => { q.accepts[0].extra.assetTransferMethod = 'permit2'; },
  };
  for (const [name, mutate] of Object.entries(attacks)) {
    let calls = 0;
    const client = createBlockchainIqClient({ ...transport({ mutate: q => { mutate(q); return q; } }), allowPayment: true,
      paymentAdapter: signer(async () => { calls++; return SIGNATURE; }) });
    await expectCode(client.get('brief'), 'UNSAFE_PAYMENT_QUOTE'); assert.equal(calls, 0, name);
  }
});

test('the adapter signs nothing above the context it is given, and only the brief with no context', async () => {
  const url = `${BASE}/analyst-pack`;
  await expectCode(signer().createPaymentHeader(challenge(url, '2000000')), 'UNSAFE_PAYMENT_QUOTE');
  await expectCode(signer().createPaymentHeader(challenge(url, '2000000'), { context: { url, maxAmount: '1999999' } }), 'UNSAFE_PAYMENT_QUOTE');
  assert.throws(() => validatePaymentRequired(challenge(url, '2000000'), { url, maxAmount: '25000001' }), /UNSAFE_PAYMENT_QUOTE/);
  assert.throws(() => validatePaymentRequired(challenge('https://attacker.invalid/api/x402/v1/x', '1'), { url: 'https://attacker.invalid/api/x402/v1/x', maxAmount: '10' }), /UNSAFE_PAYMENT_QUOTE/);
  assert.ok(await signer().createPaymentHeader(challenge(url, '2000000'), { context: { url, maxAmount: '2000000' } }));
});

test('invalid limits are rejected at construction', () => {
  for (const options of [{ maxPricePerCallUsd: '25.01' }, { maxPricePerCallUsd: '0' }, { maxPricePerCallUsd: '-1' }, { maxPricePerCallUsd: '1e3' },
    { maxPayments: 0 }, { maxPayments: 1.5 }, { maxTotalUsd: 'lots' }, { maxResponseBytes: 10 }]) {
    assert.throws(() => createBlockchainIqClient(options), error => error.code === 'INVALID_OPTIONS');
  }
});

test('a paid body without the Blockchain IQ envelope is rejected and the reservation is kept', async () => {
  const t = transport(); const inner = t.fetchImpl;
  const fetchImpl = async (url, init) => init.headers['PAYMENT-SIGNATURE'] ? paid({ content: { source: 'attacker' } }) : inner(url, init);
  const client = paying({ fetchImpl });
  await expectCode(client.get('brief'), 'INVALID_RESPONSE_ENVELOPE'); assert.equal(client.getBudget().authorizations, 1);
});

test('catalogue parsing and URL building never leave the fixed origin', () => {
  assert.throws(() => parseCatalog({ ...CATALOG, source: 'other' }), /INVALID_CATALOG/);
  assert.throws(() => parseCatalog({ ...envelope, data: [] }), /INVALID_CATALOG/);
  const resources = parseCatalog(CATALOG);
  assert.equal(buildUrl(resources.get('event-risk'), { minImportance: 2, days: 30 }), `${BASE}/event-risk?days=30&minImportance=2`);
  assert.equal(new URL(buildUrl(resources.get('research'), { coin: 'xrp' })).origin, POLICY.origin);
});

test('LangChain tools: the catalogue tool is free and the get tool rejects extra arguments before any request', async () => {
  const t = transport();
  const [catalogTool, getTool] = createBlockchainIqTools({ ...t, allowPayment: true, paymentAdapter: signer(), maxPricePerCallUsd: '0.05' });
  assert.equal(catalogTool.name, 'blockchainiq_catalog'); assert.equal(getTool.name, 'blockchainiq_get');
  assert.equal(JSON.parse(await catalogTool.invoke({})).length, 6);
  await assert.rejects(getTool.invoke({ resource: 'brief', url: 'https://attacker.invalid' }));
  await assert.rejects(getTool.invoke({ resource: 'BRIEF/../x' }));
  assert.ok(t.calls.every(c => c.url === BASE));
  const message = await getTool.invoke({ type: 'tool_call', name: getTool.name, id: 'offline', args: { resource: 'event-risk', params: { days: 7 } } });
  assert.equal(JSON.parse(message.content).data.url, `${BASE}/event-risk?days=7`);
  assert.equal(message.artifact.payment.reservedUnits, '50000');
  assert.match(getTool.description, /at most \$0\.05 per call/);
});
