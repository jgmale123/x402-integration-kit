const ORIGIN = 'https://www.blockchainiq.co';
export const POLICY = Object.freeze({
  origin: ORIGIN,
  catalogUrl: `${ORIGIN}/api/x402/v1`,
  url: `${ORIGIN}/api/x402/v1/brief`,
  network: 'eip155:8453',
  chainId: 8453,
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  payTo: '0x617dA9383fbA67e86137BC4924b8b7E400fB7C9e',
  maxAmount: '10000',
  // Changed by Blockchain IQ: the any-resource client may pay more than the brief costs, but never
  // more than the owner's per-call limit, and never more than this ceiling whatever the owner sets.
  defaultMaxPerCall: '50000',
  hardMaxPerCall: '25000000',
  maxTimeoutSeconds: 300,
});
/** The original fixed context: the market brief at no more than 0.01 USDC. */
export const BRIEF_CONTEXT = Object.freeze({ url: POLICY.url, maxAmount: POLICY.maxAmount });

export class BriefError extends Error {
  constructor(code) { super(code); this.name = 'BriefError'; this.code = code; }
}
export function fail(code) { throw new BriefError(code); }
export const sameAddress = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
export const isAddress = a => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
export const isHash = a => typeof a === 'string' && /^0x[0-9a-fA-F]{64}$/.test(a);
export const isSignature = a => typeof a === 'string' && /^0x[0-9a-fA-F]{130}$/.test(a);

/** Units are USDC atomic units (6 decimals). "0.05" -> 50000n. Rejects anything that is not a plain positive amount. */
export function usdToUnits(value) {
  const text = typeof value === 'number' ? value.toFixed(6) : value;
  if (typeof text !== 'string' || !/^\d{1,4}(\.\d{1,6})?$/.test(text)) fail('INVALID_OPTIONS');
  const [whole, fraction = ''] = text.split('.');
  const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  if (units < 1n || units > BigInt(POLICY.hardMaxPerCall) * 1000n) fail('INVALID_OPTIONS');
  return units;
}
export function unitsToUsd(units) {
  const u = BigInt(units);
  return `${u / 1000000n}.${(u % 1000000n).toString().padStart(6, '0')}`.replace(/(\.\d{2}\d*?)0+$/, '$1');
}

function checkContext(context) {
  let max;
  try { max = BigInt(context?.maxAmount); } catch { fail('UNSAFE_PAYMENT_QUOTE'); }
  if (typeof context.url !== 'string' || !context.url.startsWith(`${POLICY.catalogUrl}/`) ||
      max < 1n || max > BigInt(POLICY.hardMaxPerCall)) fail('UNSAFE_PAYMENT_QUOTE');
  return max;
}

/**
 * Changed by Blockchain IQ: the server now offers one payment option per rail (Base and Solana).
 * Exactly one option must be USDC on Base to the pinned payee; options on other networks are
 * dropped unsigned. `context` fixes the URL being bought and the most this call may cost.
 */
export function validatePaymentRequired(value, context = BRIEF_CONTEXT) {
  const max = checkContext(context);
  if (!value || value.x402Version !== 2 || value.resource?.url !== context.url ||
      !Array.isArray(value.accepts) || value.accepts.length < 1 || value.accepts.length > 8) fail('UNSAFE_PAYMENT_QUOTE');
  const onBase = value.accepts.filter(option => option?.network === POLICY.network);
  if (onBase.length !== 1) fail('UNSAFE_PAYMENT_QUOTE');
  const q = onBase[0];
  if (q.scheme !== 'exact' ||
      !sameAddress(q.asset, POLICY.asset) || !sameAddress(q.payTo, POLICY.payTo) ||
      typeof q.amount !== 'string' || !/^[1-9]\d{0,7}$/.test(q.amount) || BigInt(q.amount) > max ||
      !Number.isInteger(q.maxTimeoutSeconds) || q.maxTimeoutSeconds < 1 || q.maxTimeoutSeconds > 300 ||
      q.extra?.name !== 'USD Coin' || q.extra?.version !== '2' ||
      Object.keys(q.extra).some(k => !['name', 'version'].includes(k))) fail('UNSAFE_PAYMENT_QUOTE');
  // Drop untrusted extensions, other rails and optional metadata before giving the quote to the SDK.
  return { x402Version: 2, resource: { url: context.url, mimeType: 'application/json' }, accepts: [{
    scheme: 'exact', network: POLICY.network, asset: POLICY.asset, payTo: POLICY.payTo,
    amount: q.amount, maxTimeoutSeconds: q.maxTimeoutSeconds, extra: { name: 'USD Coin', version: '2' },
  }] };
}

const fields = [
  { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
];
export function validateTypedData(data, address, quote, nowSeconds = Math.floor(Date.now() / 1000), context = BRIEF_CONTEXT) {
  const { domain: d, message: m } = data ?? {};
  const q = validatePaymentRequired(quote, context).accepts[0];
  if (!isAddress(address) || data.primaryType !== 'TransferWithAuthorization' ||
      d?.name !== 'USD Coin' || d.version !== '2' || Number(d.chainId) !== POLICY.chainId ||
      !sameAddress(d.verifyingContract, POLICY.asset) ||
      Object.keys(d).some(k => !['name', 'version', 'chainId', 'verifyingContract'].includes(k)) ||
      JSON.stringify(data.types?.TransferWithAuthorization) !== JSON.stringify(fields) ||
      Object.keys(data.types ?? {}).some(k => !['TransferWithAuthorization', 'EIP712Domain'].includes(k)) ||
      !m || Object.keys(m).some(k => !fields.some(f => f.name === k)) ||
      !sameAddress(m.from, address) || !sameAddress(m.to, POLICY.payTo) || !isHash(m.nonce)) fail('UNSAFE_SIGNING_REQUEST');
  try {
    if (BigInt(m.value) !== BigInt(q.amount) || BigInt(m.validAfter) !== 0n ||
        BigInt(m.validBefore) < BigInt(nowSeconds) ||
        BigInt(m.validBefore) > BigInt(nowSeconds + q.maxTimeoutSeconds)) fail('UNSAFE_SIGNING_REQUEST');
  } catch { fail('UNSAFE_SIGNING_REQUEST'); }
  return data;
}
