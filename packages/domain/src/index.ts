import crypto from "node:crypto";

export type ScanStatus = "queued" | "running" | "succeeded" | "failed";

export function verifyGithubSignature(rawBody: string, secret: string, signature256?: string): boolean {
  if (!signature256) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature256);
  if (expectedBuf.length != actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export function buildJobKey(repoFullName: string, commitSha: string): string {
  return `${repoFullName}:${commitSha}`;
}

export function parseBranch(ref: string): string {
  return ref.replace("refs/heads/", "");
}

export function severitySummary(findings: Array<{ severity: "low" | "medium" | "high" | "critical" }>) {
  return findings.reduce(
    (acc, cur) => {
      acc.total += 1;
      acc[cur.severity] += 1;
      return acc;
    },
    { total: 0, low: 0, medium: 0, high: 0, critical: 0 }
  );
}
