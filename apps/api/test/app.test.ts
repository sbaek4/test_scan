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
import { signToken } from "../src/auth.js";

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
    process.env.AUTH_JWT_SECRET = "dev_auth_secret";
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

  it("returns health and db health", async () => {
    const app = createApp();
    const health = await request(app).get("/health");
    const db = await request(app).get("/health/db");
    expect(health.status).toBe(200);
    expect(health.body.ok).toBe(true);
    expect(db.status).toBe(200);
    expect(db.body.db).toBe("up");
  });

  it("supports protected crud operations", async () => {
    const inMemory = new Map<string, { id: string; name: string; createdAt: string }>();
    const app = createApp({
      dynamo: {
        async create(item) {
          inMemory.set(item.id, item);
          return item;
        },
        async get(id) {
          return inMemory.get(id) ?? null;
        },
        async list() {
          return Array.from(inMemory.values());
        },
        async update(id, name) {
          const old = inMemory.get(id);
          if (!old) return null;
          const next = { ...old, name };
          inMemory.set(id, next);
          return next;
        },
        async delete(id) {
          inMemory.delete(id);
        }
      }
    });
    const token = signToken({ sub: "tester" }, "dev_auth_secret");

    const created = await request(app)
      .post("/v1/items")
      .set("authorization", `Bearer ${token}`)
      .send({ id: "item-1", name: "first" });
    expect(created.status).toBe(201);

    const listed = await request(app).get("/v1/items").set("authorization", `Bearer ${token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.length).toBe(1);

    const fetched = await request(app).get("/v1/items/item-1").set("authorization", `Bearer ${token}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.name).toBe("first");

    const updated = await request(app)
      .put("/v1/items/item-1")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "updated" });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("updated");

    const deleted = await request(app).delete("/v1/items/item-1").set("authorization", `Bearer ${token}`);
    expect(deleted.status).toBe(204);
  });

  it("rejects protected crud without token", async () => {
    const app = createApp();
    const res = await request(app).get("/v1/items");
    expect(res.status).toBe(401);
  });
});
