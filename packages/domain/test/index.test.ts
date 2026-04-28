import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildJobKey, parseBranch, severitySummary, verifyGithubSignature } from "../src/index";

describe("domain helpers", () => {
  it("verifies github signature", () => {
    const body = JSON.stringify({ hello: "world" });
    const secret = "abc";
    const sig = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyGithubSignature(body, secret, sig)).toBe(true);
    expect(verifyGithubSignature(body, secret, "sha256=invalid")).toBe(false);
  });

  it("builds job key", () => {
    expect(buildJobKey("a/b", "sha")).toBe("a/b:sha");
  });

  it("parses branch", () => {
    expect(parseBranch("refs/heads/main")).toBe("main");
  });

  it("creates severity summary", () => {
    const summary = severitySummary([{ severity: "high" }, { severity: "low" }]);
    expect(summary.total).toBe(2);
    expect(summary.high).toBe(1);
    expect(summary.low).toBe(1);
  });
});
