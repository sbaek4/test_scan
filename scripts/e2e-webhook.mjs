import crypto from "node:crypto";
import { execSync } from "node:child_process";
import http from "node:http";

const apiBase = process.env.API_BASE_URL ?? "http://localhost:3000";
const webhookSecret = process.env.WEBHOOK_SECRET ?? "dev_secret";
const callbackPort = Number(process.env.CALLBACK_PORT ?? 3300);
const callbackUrl = `http://host.docker.internal:${callbackPort}/callback`;
const repoUrl = "https://github.com/sbaek4/test_scan.git";

function getMainSha() {
  const out = execSync(`git ls-remote ${repoUrl} refs/heads/main`, { encoding: "utf8" }).trim();
  if (!out) throw new Error("Unable to resolve main branch SHA");
  return out.split(/\s+/)[0];
}

async function main() {
  const callbackEvents = [];
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/callback") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      callbackEvents.push(raw);
      res.statusCode = 200;
      res.end("ok");
    });
  });

  await new Promise((resolve) => server.listen(callbackPort, resolve));

  try {
    const warmupStart = Date.now();
    while (Date.now() - warmupStart < 60_000) {
      try {
        const health = await fetch(`${apiBase}/health`);
        if (health.ok) break;
      } catch {
        // Keep polling until API is ready.
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    const sha = getMainSha();
    const payload = {
      ref: "refs/heads/main",
      after: sha,
      repository: {
        full_name: "sbaek4/test_scan",
        ssh_url: repoUrl
      },
      head_commit: {
        id: sha,
        message: "e2e webhook simulation",
        timestamp: new Date().toISOString(),
        author: { name: "local-tester", email: "local@example.com" }
      },
      callback_url: callbackUrl
    };
    const raw = JSON.stringify(payload);
    const sig = `sha256=${crypto.createHmac("sha256", webhookSecret).update(raw).digest("hex")}`;

    const res = await fetch(`${apiBase}/webhooks/github`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-delivery": `local-${Date.now()}`,
        "x-github-event": "push",
        "x-hub-signature-256": sig
      },
      body: raw
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Webhook failed: ${res.status} ${body}`);
    console.log("Webhook accepted:", body);

    const started = Date.now();
    while (Date.now() - started < 90_000) {
      if (callbackEvents.length > 0) {
        console.log("Callback received:", callbackEvents[0]);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error("Timed out waiting for callback event");
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
