import crypto from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db.js", () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) }
}));

vi.mock("../src/kafka.js", () => ({
  publishScanRequest: vi.fn().mockResolvedValue(undefined)
}));

import { createApp } from "../src/app.js";

const payload = {
  ref: "refs/heads/main",
  after: "abcdef",
  repository: { full_name: "sbaek4/test_scan", ssh_url: "git@github.com:sbaek4/test_scan.git" },
  head_commit: {
    id: "abcdef",
    message: "msg",
    timestamp: "2025-01-01T00:00:00Z",
    author: { name: "a", email: "a@a.com" }
  }
};

describe("webhook endpoint", () => {
  beforeEach(() => {
    process.env.WEBHOOK_SECRET = "dev_secret";
  });

  it("returns 401 when signature is invalid", async () => {
    const res = await request(createApp())
      .post("/webhooks/github")
      .set("x-github-delivery", "id-1")
      .set("x-hub-signature-256", "sha256=bad")
      .send(payload);

    expect(res.status).toBe(401);
  });

  it("queues job with valid signature", async () => {
    const body = JSON.stringify(payload);
    const sig = "sha256=" + crypto.createHmac("sha256", "dev_secret").update(body).digest("hex");

    const res = await request(createApp())
      .post("/webhooks/github")
      .set("x-github-delivery", "id-2")
      .set("x-github-event", "push")
      .set("x-hub-signature-256", sig)
      .set("content-type", "application/json")
      .send(body);

    expect(res.status).toBe(202);
    expect(res.body.status).toBe("queued");
  });
});
