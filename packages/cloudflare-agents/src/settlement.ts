import { NETWORK } from "./policy.ts";

export function settlementEvidence(header: string | null, payer: string, paymentAttempted: boolean) {
  if (!paymentAttempted) return { status: "unpaid-response" };
  if (!header || header.length > 8192) return { status: "unverified-response" };
  try {
    const receipt = JSON.parse(atob(header));
    if (receipt.success !== true || receipt.network !== NETWORK || typeof receipt.transaction !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(receipt.transaction) || (receipt.payer !== undefined && (typeof receipt.payer !== "string" || receipt.payer.toLowerCase() !== payer.toLowerCase()))) return { status: "unverified-response" };
    return { status: "provider-reported", transaction: receipt.transaction as string };
  } catch { return { status: "unverified-response" }; }
}
