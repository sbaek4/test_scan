import { describe, expect, it, vi } from "vitest";
import { JobCacheService } from "../src/jobCache.js";

describe("job cache service", () => {
  it("reads and writes cache records", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { jobKey: "k1", status: "succeeded", scanJobId: "j1" } });
    const svc = new JobCacheService({ send } as never, "finished_scan_jobs");
    await svc.put({
      jobKey: "k1",
      status: "succeeded",
      scanJobId: "j1",
      finishedAt: "t",
      expiresAt: 1
    });
    const row = await svc.get("k1");
    expect(row?.jobKey).toBe("k1");
    expect(send).toHaveBeenCalledTimes(2);
  });
});
