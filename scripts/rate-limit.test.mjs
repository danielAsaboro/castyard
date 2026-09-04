import { describe, expect, it } from "vitest";

import { isTransientNetworkError, retryDelayMs } from "./rate-limit.mjs";

describe("retryDelayMs", () => {
  it("uses the upstream absolute reset time with a small boundary buffer", () => {
    const headers = new Headers({ "x-ratelimit-reset": "2026-08-17T14:13:00.000Z" });
    expect(retryDelayMs(headers, Date.parse("2026-08-17T14:12:55.000Z"))).toBe(5250);
  });

  it("returns null when the upstream does not publish recovery timing", () => {
    expect(retryDelayMs(new Headers(), 0)).toBeNull();
  });
});

describe("isTransientNetworkError", () => {
  it("retries fetch timeouts and network transport failures", () => {
    expect(isTransientNetworkError(new DOMException("timed out", "TimeoutError"))).toBe(true);
    expect(isTransientNetworkError(new TypeError("fetch failed"))).toBe(true);
  });

  it("does not retry assertion and schema failures", () => {
    expect(isTransientNetworkError(new Error("invalid envelope"))).toBe(false);
  });
});
