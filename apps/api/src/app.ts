import express from "express";
import { v4 as uuidv4 } from "uuid";
import { buildJobKey, parseBranch, verifyGithubSignature } from "@test-scan/domain";
import { pool } from "./db.js";
import { publishScanRequest } from "./kafka.js";

interface PushEventPayload {
  ref: string;
  after: string;
  repository: { full_name: string; ssh_url: string };
  head_commit?: {
    id: string;
    message: string;
    timestamp: string;
    author: { name: string; email: string };
  };
  callback_url?: string;
}

export function createApp() {
  const app = express();
  app.use(express.json({ verify: (req: any, _res, buf) => (req.rawBody = buf.toString()) }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.post("/webhooks/github", async (req: any, res) => {
    const deliveryId = req.headers["x-github-delivery"] as string;
    const sig = req.headers["x-hub-signature-256"] as string | undefined;
    const event = (req.headers["x-github-event"] as string) ?? "push";
    const secret = process.env.WEBHOOK_SECRET ?? "dev_secret";

    const rawBody = req.rawBody ?? JSON.stringify(req.body);
    const valid = verifyGithubSignature(rawBody, secret, sig);
    if (!valid) return res.status(401).json({ error: "invalid signature" });

    const payload = req.body as PushEventPayload;
    const [owner, name] = payload.repository.full_name.split("/");
    const repositoryId = uuidv4();
    const eventId = uuidv4();
    const commitId = uuidv4();
    const scanJobId = uuidv4();

    await pool.query(
      `INSERT INTO repositories (id, owner, name, clone_url_ssh)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (provider, owner, name) DO UPDATE SET clone_url_ssh = excluded.clone_url_ssh`,
      [repositoryId, owner, name, payload.repository.ssh_url]
    );

    await pool.query(
      `INSERT INTO webhook_events (id, repository_id, delivery_id, event_type, signature_valid, payload, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [eventId, repositoryId, deliveryId, event, true, payload, "queued"]
    );

    await pool.query(
      `INSERT INTO commits (id, webhook_event_id, repository_id, commit_sha, branch, author_name, author_email, message, timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        commitId,
        eventId,
        repositoryId,
        payload.after,
        parseBranch(payload.ref),
        payload.head_commit?.author.name ?? null,
        payload.head_commit?.author.email ?? null,
        payload.head_commit?.message ?? null,
        payload.head_commit?.timestamp ?? null
      ]
    );

    const jobKey = buildJobKey(payload.repository.full_name, payload.after);
    await pool.query(`INSERT INTO scan_jobs (id, commit_id, job_key, status) VALUES ($1,$2,$3,$4)`, [
      scanJobId,
      commitId,
      jobKey,
      "queued"
    ]);

    await publishScanRequest({
      scanJobId,
      repository: payload.repository.ssh_url,
      sha: payload.after,
      callbackUrl: payload.callback_url ?? null
    });

    return res.status(202).json({ scanJobId, status: "queued" });
  });

  return app;
}
