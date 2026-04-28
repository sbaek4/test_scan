import { describe, expect, it } from "vitest";
import { requireAuth, signToken } from "../src/auth.js";

describe("auth helpers", () => {
  it("signs token string", () => {
    const token = signToken({ sub: "u1" }, "secret");
    expect(typeof token).toBe("string");
  });

  it("rejects missing authorization header", () => {
    const middleware = requireAuth("secret");
    const req = { headers: {} } as any;
    const res = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        return body;
      }
    } as any;
    let called = false;
    middleware(req, res, () => {
      called = true;
    });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});
