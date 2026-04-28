import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders function component", () => {
    expect(typeof App).toBe("function");
  });
});
