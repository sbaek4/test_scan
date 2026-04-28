import { describe, expect, it } from "vitest";
import { withRetry } from "../src/retry.js";

describe("withRetry", () => {
  it("retries until success", async () => {
    let runs = 0;
    const result = await withRetry(async () => {
      runs += 1;
      if (runs < 3) throw new Error("retry");
      return "ok";
    }, 3, 1);
    expect(result).toBe("ok");
    expect(runs).toBe(3);
  });
});
