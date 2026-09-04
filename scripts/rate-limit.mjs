export function retryDelayMs(headers, nowMs = Date.now()) {
  const resetAt = headers.get("x-ratelimit-reset");
  if (resetAt) {
    const resetMs = Date.parse(resetAt);
    if (Number.isFinite(resetMs)) return Math.max(0, resetMs - nowMs) + 250;
  }
  const retryAfter = headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1_000 + 250;
  return null;
}

export function isTransientNetworkError(error) {
  return error instanceof TypeError
    || (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError"));
}
