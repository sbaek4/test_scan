import { describe, expect, it, vi } from "vitest";
import { migrate, pool } from "../src/db.js";

describe("db module", () => {
  it("runs migrate query without throwing", async () => {
    const querySpy = vi.spyOn(pool, "query").mockResolvedValue({} as never);
    await migrate();
    expect(querySpy).toHaveBeenCalledTimes(1);
    querySpy.mockRestore();
  });
});
