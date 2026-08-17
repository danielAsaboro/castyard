import { describe, expect, it } from "vitest";

import { resolveSiteOrigin } from "./site-url";

describe("resolveSiteOrigin", () => {
  it("derives the public origin from forwarded request headers", () => {
    expect(resolveSiteOrigin(new Headers({ "x-forwarded-host": "castyard.example", "x-forwarded-proto": "https" }))).toBe("https://castyard.example");
  });

  it("falls back to a safe local origin when request headers are unavailable", () => {
    expect(resolveSiteOrigin(new Headers())).toBe("http://localhost:3000");
  });
});
