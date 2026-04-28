import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { severitySummary } from "@test-scan/domain";

function execFileAsync(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    execFile(cmd, args, (err) => (err ? reject(err) : resolve()));
  });
}

export async function runSecurityScan(repoSshUrl: string, sha: string) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "scan-"));
  try {
    await execFileAsync("git", ["clone", "--depth", "1", repoSshUrl, tmpDir]);
    await execFileAsync("git", ["-C", tmpDir, "checkout", sha]);
    const findings: Array<{ severity: "low" | "medium" | "high" | "critical" }> = [];
    const summary = severitySummary(findings);
    return { findings, summary, scannerVersion: "v0-local" };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
