// Added by Blockchain IQ (see CHANGES.md). Owner-set spending limits for POST /resource.
import { HARD_MAX_ATOMS, usdToAtoms } from "./policy.ts";

export type LimitEnv = { MAX_PRICE_PER_CALL_USD?: string; MAX_PAYMENTS?: string; MAX_TOTAL_USD?: string };

/** Owner limits from the environment. Defaults: 0.05 USDC a call, one payment, total = per call x payments. */
export function readLimits(env: LimitEnv) {
  const perCall = usdToAtoms(env.MAX_PRICE_PER_CALL_USD ?? "0.05");
  if (BigInt(perCall) > BigInt(HARD_MAX_ATOMS)) throw Error("Per-call limit is above the 25.00 USDC ceiling");
  const payments = env.MAX_PAYMENTS === undefined ? 1 : Number(env.MAX_PAYMENTS);
  if (!/^[1-9][0-9]{0,4}$/.test(env.MAX_PAYMENTS ?? "1") || payments > 10000) throw Error("Malformed payment count limit");
  const total = env.MAX_TOTAL_USD === undefined ? (BigInt(perCall) * BigInt(payments)).toString() : usdToAtoms(env.MAX_TOTAL_USD);
  return { perCall, payments, total };
}

/** "50000" -> "0.05". */
export function atomsToUsd(atoms: string): string {
  const a = BigInt(atoms);
  return `${a / 1000000n}.${(a % 1000000n).toString().padStart(6, "0")}`.replace(/(\.\d{2}\d*?)0+$/, "$1");
}
