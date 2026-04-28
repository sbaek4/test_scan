import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

export interface AuthClaims {
  sub: string;
  role?: string;
}

export function signToken(claims: AuthClaims, secret: string): string {
  return jwt.sign(claims, secret, { expiresIn: "1h" });
}

export function requireAuth(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const raw = req.headers.authorization;
    if (!raw || !raw.startsWith("Bearer ")) {
      return res.status(401).json({ error: "missing bearer token" });
    }

    const token = raw.slice("Bearer ".length);
    try {
      const decoded = jwt.verify(token, secret) as AuthClaims;
      (req as Request & { user?: AuthClaims }).user = decoded;
      return next();
    } catch {
      return res.status(401).json({ error: "invalid token" });
    }
  };
}
