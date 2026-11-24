import { decodePaymentRequiredHeader, decodePaymentSignatureHeader } from '@x402/core/http';
import { decodePaymentResponseHeader } from '@x402/fetch';
import { BRIEF_CONTEXT, BriefError, fail, isAddress, isHash, isSignature, POLICY, sameAddress, unitsToUsd, usdToUnits, validatePaymentRequired, validateTypedData } from './policy.js';
import { buildUrl, listResources, parseCatalog } from './catalog.js';
export { POLICY, BriefError, BRIEF_CONTEXT } from './policy.js';
export { createSdkPaymentAdapter, toRpcTypedData } from './sdk-payment.js';
export { buildUrl, listResources, parseCatalog } from './catalog.js';

const HEADER_LIMIT = 262144;
function decodeHeader(value, decode) {
  if (typeof value !== 'string' || value.length > HEADER_LIMIT || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4) fail('INVALID_X402_HEADER');
  try { return decode(value); } catch { fail('INVALID_X402_HEADER'); }
}
async function readJson(response, limit) {
  if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) fail('INVALID_RESPONSE');
  const reader = response.body?.getReader();
  if (!reader) fail('INVALID_RESPONSE');
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); fail('RESPONSE_TOO_LARGE'); }
      chunks.push(value);
    }
    const joined = new Uint8Array(length); let offset = 0;
    for (const part of chunks) { joined.set(part, offset); offset += part.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined));
  } catch (error) { if (error instanceof BriefError) throw error; fail('INVALID_RESPONSE'); }
}
function checkBrief(data) {
  if (!data || data.source !== 'Blockchain IQ' || typeof data.disclaimer !== 'string' ||
      data.terms !== 'https://www.blockchainiq.co/terms' || !data.data ||
      typeof data.data.asOf !== 'string' || !Array.isArray(data.data.coins) ||
      !Array.isArray(data.data.events) || !Array.isArray(data.data.flags)) fail('INVALID_BRIEF');
  return data;
}
/** Every Blockchain IQ x402 response carries the same envelope; anything else is rejected. */
function checkEnvelope(data) {
  if (!data || typeof data !== 'object' || data.source !== 'Blockchain IQ' ||
      data.terms !== 'https://www.blockchainiq.co/terms') fail('INVALID_RESPONSE_ENVELOPE');
  return data;
}

/**
 * Shared engine. One engine holds one spending budget: `maxTotalUnits` across at most `maxPayments`
 * authorizations, reserved before the wallet is asked and never refunded automatically.
 */
function createEngine({ paymentAdapter, allowPayment = false, fetchImpl = globalThis.fetch, timeoutMs = 15000, maxTotalUnits, maxPayments, maxResponseBytes }) {
  if (typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) fail('INVALID_OPTIONS');
  if (allowPayment && (!isAddress(paymentAdapter?.address) || typeof paymentAdapter.createPaymentHeader !== 'function')) fail('INVALID_SIGNER');
  let reservedUnits = 0n, authorizations = 0;
  const budget = () => ({ reservedUnits: reservedUnits.toString(), maxUnits: maxTotalUnits.toString(), authorizations, remainingAuthorizations: maxPayments - authorizations });

  async function operation(fn, externalSignal) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (externalSignal?.aborted) fail('ABORTED');
    externalSignal?.addEventListener('abort', onAbort, { once: true });
    let timer;
    const abortPromise = new Promise((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new BriefError(externalSignal?.aborted ? 'ABORTED' : 'TIMEOUT')), { once: true });
      timer = setTimeout(() => controller.abort(), timeoutMs);
    });
    try { return await Promise.race([fn(controller.signal), abortPromise]); }
    catch (error) { if (error instanceof BriefError) throw error; fail('REQUEST_FAILED'); }
    finally { clearTimeout(timer); externalSignal?.removeEventListener('abort', onAbort); }
  }
  async function request(url, signal, header) {
    if (signal.aborted) fail('ABORTED');
    const response = await fetchImpl(url, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', signal,
      headers: { Accept: 'application/json', ...(header ? { 'PAYMENT-SIGNATURE': header } : {}) } });
    if (signal.aborted) fail('ABORTED');
    if (response.redirected || response.status >= 300 && response.status < 400 || response.url && response.url !== url) fail('REDIRECT_REJECTED');
    return response;
  }
  async function unpaid(context, signal) {
    const response = await request(context.url, signal);
    if (response.status !== 402) { await response.body?.cancel(); fail('EXPECTED_PAYMENT_REQUIRED'); }
    const quote = validatePaymentRequired(decodeHeader(response.headers.get('PAYMENT-REQUIRED'), decodePaymentRequiredHeader), context);
    await response.body?.cancel();
    return quote;
  }
  async function free(url, signal, check) {
    const response = await request(url, signal);
    if (response.status !== 200) { await response.body?.cancel(); fail('FREE_REQUEST_FAILED'); }
    return check(await readJson(response, maxResponseBytes));
  }
  async function pay(context, signal, check) {
    const quote = await unpaid(context, signal);
    if (!allowPayment) fail('PAYMENT_DISABLED');
    if (authorizations >= maxPayments) fail('PAYMENT_BUDGET_EXHAUSTED');
    const amount = BigInt(quote.accepts[0].amount);
    if (reservedUnits + amount > maxTotalUnits) fail('PAYMENT_BUDGET_EXHAUSTED');
    // Never refund this reservation automatically: a rejected/late wallet callback may have signed.
    reservedUnits += amount; authorizations++;
    const header = await paymentAdapter.createPaymentHeader(quote, { signal, context });
    if (signal.aborted) fail('ABORTED');
    const payload = decodeHeader(header, decodePaymentSignatureHeader);
    const accepted = validatePaymentRequired({ x402Version: payload.x402Version, resource: payload.resource, accepts: [payload.accepted] }, context);
    if (JSON.stringify(accepted) !== JSON.stringify(quote) || !isSignature(payload.payload?.signature)) fail('UNSAFE_PAYMENT_PAYLOAD');
    const auth = payload.payload?.authorization;
    const expectedTypes = { TransferWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ] };
    validateTypedData({ domain: { name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: POLICY.asset },
      types: expectedTypes, primaryType: 'TransferWithAuthorization', message: auth }, paymentAdapter.address, quote, undefined, context);
    const response = await request(context.url, signal, header);
    if (response.status !== 200) { await response.body?.cancel(); fail(response.status === 402 ? 'PAYMENT_REJECTED_NO_RETRY' : 'PAID_REQUEST_FAILED_NO_RETRY'); }
    const receipt = decodeHeader(response.headers.get('PAYMENT-RESPONSE'), decodePaymentResponseHeader);
    if (!receipt || receipt.success !== true || receipt.network !== POLICY.network || !isHash(receipt.transaction) ||
        !sameAddress(receipt.payer, paymentAdapter.address)) { await response.body?.cancel(); fail('SETTLEMENT_UNCONFIRMED'); }
    const content = check(await readJson(response, maxResponseBytes));
    return { content, receipt: { success: true, network: receipt.network, transaction: receipt.transaction, payer: receipt.payer }, payment: budget() };
  }
  return { budget, operation, unpaid, free, pay };
}

/** One client lifetime authorizes at most one payment, reserving the budget before wallet interaction. */
export function createBriefClient(options = {}) {
  const engine = createEngine({ ...options, maxTotalUnits: BigInt(POLICY.maxAmount), maxPayments: 1, maxResponseBytes: 1024 * 1024 });
  return Object.freeze({
    getBudget: engine.budget,
    quote: ({ signal } = {}) => engine.operation(active => engine.unpaid(BRIEF_CONTEXT, active), signal),
    run: ({ signal } = {}) => engine.operation(active => engine.pay(BRIEF_CONTEXT, active, checkBrief), signal),
  });
}

/**
 * Added by Blockchain IQ: buys any resource in the live catalogue (https://www.blockchainiq.co/api/x402/v1).
 * The owner sets the limits; tool arguments can only name a catalogue resource and its listed parameters.
 *   maxPricePerCallUsd  most one call may cost (default "0.05", never above 25.00)
 *   maxPayments         most payments this client will ever sign (default 1)
 *   maxTotalUsd         most this client will ever spend (default maxPricePerCallUsd x maxPayments)
 */
export function createBlockchainIqClient({ maxPricePerCallUsd = '0.05', maxPayments = 1, maxTotalUsd, maxResponseBytes = 16 * 1024 * 1024, ...rest } = {}) {
  const perCall = usdToUnits(maxPricePerCallUsd);
  if (perCall > BigInt(POLICY.hardMaxPerCall) || !Number.isInteger(maxPayments) || maxPayments < 1 || maxPayments > 10000 ||
      !Number.isInteger(maxResponseBytes) || maxResponseBytes < 1024 || maxResponseBytes > 64 * 1024 * 1024) fail('INVALID_OPTIONS');
  const total = maxTotalUsd === undefined ? perCall * BigInt(maxPayments) : usdToUnits(maxTotalUsd);
  const engine = createEngine({ ...rest, maxTotalUnits: total, maxPayments, maxResponseBytes });
  let resources;
  async function load(signal, refresh) {
    if (!resources || refresh) resources = parseCatalog(await engine.free(POLICY.catalogUrl, signal, data => data));
    return resources;
  }
  async function resolve(id, params, signal) {
    const resource = (await load(signal)).get(id);
    if (!resource || resource.id === 'catalog') fail('UNKNOWN_RESOURCE');
    return { resource, url: buildUrl(resource, params) };
  }
  return Object.freeze({
    getBudget: engine.budget,
    getLimits: () => ({ maxPricePerCallUsd: unitsToUsd(perCall), maxTotalUsd: unitsToUsd(total), maxPayments }),
    /** Free. The list of resources with prices and parameters. */
    catalog: ({ signal, refresh = false } = {}) => engine.operation(async active => listResources(await load(active, refresh)), signal),
    /** Free. The server's price for one resource; signs nothing. */
    quote: (id, params = {}, { signal } = {}) => engine.operation(async active => {
      const { resource, url } = await resolve(id, params, active);
      if (resource.priceUnits === 0n) return { resource: id, url, price: 'free' };
      const quote = await engine.unpaid({ url, maxAmount: POLICY.hardMaxPerCall }, active);
      return { resource: id, url, price: `$${unitsToUsd(quote.accepts[0].amount)}`, quote };
    }, signal),
    /** Reads one resource, paying for it when it has a price and payment is enabled and within the limits. */
    get: (id, params = {}, { signal } = {}) => engine.operation(async active => {
      const { resource, url } = await resolve(id, params, active);
      if (resource.priceUnits === 0n) return { content: await engine.free(url, active, checkEnvelope), receipt: null, payment: engine.budget() };
      if (resource.priceUnits > perCall) fail('PRICE_ABOVE_LIMIT');
      return engine.pay({ url, maxAmount: perCall.toString() }, active, checkEnvelope);
    }, signal),
  });
}
