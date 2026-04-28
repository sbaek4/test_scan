import rateLimit from "express-rate-limit";

export function createRateLimiter() {
  return rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 60),
    standardHeaders: true,
    legacyHeaders: false
  });
}
