import { describe, expect, it } from "vitest";
import { makeDlqPayload } from "../src/dlq.js";

describe("dlq payload", () => {
  it("converts error to string and preserves event", () => {
    const payload = makeDlqPayload({ event: { id: 1 }, error: new Error("boom"), failedAt: "t" });
    expect(payload.event).toEqual({ id: 1 });
    expect(payload.error).toContain("boom");
    expect(payload.failedAt).toBe("t");
  });
});
