import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../src/rateLimit.js";

describe("rate limiter", () => {
  it("returns express middleware function", () => {
    const middleware = createRateLimiter();
    expect(typeof middleware).toBe("function");
  });
});
