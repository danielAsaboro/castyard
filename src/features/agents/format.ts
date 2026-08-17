import type { EvidenceValue, SourceStamp } from "./domain";

const TRANSACTION_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export interface EvidenceFormatOptions {
  style?: "number" | "currency" | "percent";
}

export function formatEvidenceValue(
  evidence: EvidenceValue<number> | undefined,
  { style = "number" }: EvidenceFormatOptions = {},
): string {
  if (evidence?.value === undefined || !Number.isFinite(evidence.value)) {
    return "Not published";
  }

  if (style === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(evidence.value);
  }
  if (style === "percent") {
    return `${evidence.value.toFixed(2)}%`;
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(evidence.value);
}

export function formatWindow({
  windowSeconds,
  windowComplete,
}: Pick<EvidenceValue<unknown>, "windowSeconds" | "windowComplete">): string {
  if (windowSeconds === undefined || !Number.isFinite(windowSeconds)) {
    return "Window not published";
  }
  const hours = windowSeconds / 3_600;
  return `${hours.toFixed(1)}h observed · ${windowComplete ? "complete" : "incomplete"}`;
}

export function getFreshness(
  source: SourceStamp,
  now = new Date(),
  revalidationSeconds = 60,
): "current" | "stale" {
  const observedAt = Date.parse(source.observedAt);
  if (!Number.isFinite(observedAt)) {
    return "stale";
  }
  return now.getTime() - observedAt <= revalidationSeconds * 2_000 ? "current" : "stale";
}

export function formatAddress(address: string): string {
  if (!ADDRESS_PATTERN.test(address)) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-5)}`;
}

export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Invalid timestamp";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

export function isTransactionHash(value: string): boolean {
  return TRANSACTION_HASH_PATTERN.test(value);
}
