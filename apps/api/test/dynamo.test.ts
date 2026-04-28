import { describe, expect, it, vi } from "vitest";
import { DynamoCrudService } from "../src/dynamo.js";

describe("dynamo crud service", () => {
  it("creates and fetches item through client", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { id: "1", name: "n", createdAt: "t" } });
    const svc = new DynamoCrudService({ send } as any, "scan_items");
    await svc.create({ id: "1", name: "n", createdAt: "t" });
    const item = await svc.get("1");
    expect(item?.id).toBe("1");
    expect(send).toHaveBeenCalledTimes(2);
  });
});
