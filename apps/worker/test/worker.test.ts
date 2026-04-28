import { describe, expect, it, vi } from "vitest";
import * as scanner from "../src/scanner.js";

describe("worker exports", () => {
  it("scanner function exists", () => {
    expect(typeof scanner.runSecurityScan).toBe("function");
  });

  it("notifier sends payload", async () => {
    const fake = vi.fn().mockResolvedValue({ status: 200, text: async () => "ok" });
    vi.stubGlobal("fetch", fake as unknown as typeof fetch);
    const { sendNotification } = await import("../src/notifier.js");
    const res = await sendNotification("https://example.com", { ok: true });
    expect(res.status).toBe(200);
  });
});
