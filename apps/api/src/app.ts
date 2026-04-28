import express from "express";
import { v4 as uuidv4 } from "uuid";
import { buildJobKey, parseBranch, verifyGithubSignature } from "@test-scan/domain";
import { pool } from "./db.js";
import { publishScanRequest } from "./kafka.js";
import { requireAuth } from "./auth.js";
import { createRateLimiter } from "./rateLimit.js";
import { DynamoCrudService, makeDynamoClient } from "./dynamo.js";

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

interface DynamoCrudLike {
  create(item: { id: string; name: string; createdAt: string }): Promise<unknown>;
  get(id: string): Promise<unknown>;
  list(): Promise<unknown[]>;
  update(id: string, name: string): Promise<unknown>;
  delete(id: string): Promise<void>;
}

interface CreateAppOptions {
  dynamo?: DynamoCrudLike;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const authSecret = process.env.AUTH_JWT_SECRET ?? "dev_auth_secret";
  const dynamoTable = process.env.DYNAMO_TABLE_NAME ?? "scan_items";
  const dynamo = options.dynamo ?? new DynamoCrudService(makeDynamoClient(), dynamoTable);

  app.use(express.json({ verify: (req: any, _res, buf) => (req.rawBody = buf.toString()) }));
  app.use(createRateLimiter());

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/health/db", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      return res.json({ ok: true, db: "up" });
    } catch (error) {
      return res.status(503).json({ ok: false, db: "down", error: String(error) });
    }
  });

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

    const repoUpsert = await pool.query<{ id: string }>(
      `INSERT INTO repositories (id, owner, name, clone_url_ssh)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (provider, owner, name) DO UPDATE SET clone_url_ssh = excluded.clone_url_ssh
       RETURNING id`,
      [repositoryId, owner, name, payload.repository.ssh_url]
    );
    const persistedRepositoryId = repoUpsert.rows[0]?.id ?? repositoryId;

    await pool.query(
      `INSERT INTO webhook_events (id, repository_id, delivery_id, event_type, signature_valid, payload, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [eventId, persistedRepositoryId, deliveryId, event, true, payload, "queued"]
    );

    const commitInsert = await pool.query<{ id: string }>(
      `INSERT INTO commits (id, webhook_event_id, repository_id, commit_sha, branch, author_name, author_email, message, timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (repository_id, commit_sha) DO NOTHING
       RETURNING id`,
      [
        commitId,
        eventId,
        persistedRepositoryId,
        payload.after,
        parseBranch(payload.ref),
        payload.head_commit?.author.name ?? null,
        payload.head_commit?.author.email ?? null,
        payload.head_commit?.message ?? null,
        payload.head_commit?.timestamp ?? null
      ]
    );
    let persistedCommitId = commitInsert.rows[0]?.id;
    if (!persistedCommitId) {
      const existingCommit = await pool.query<{ id: string }>(
        `SELECT id FROM commits WHERE repository_id = $1 AND commit_sha = $2 LIMIT 1`,
        [persistedRepositoryId, payload.after]
      );
      persistedCommitId = existingCommit.rows[0]?.id ?? commitId;
    }

    const jobKey = buildJobKey(payload.repository.full_name, payload.after);
    const jobInsert = await pool.query<{ id: string }>(
      `INSERT INTO scan_jobs (id, commit_id, job_key, status)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (job_key) DO NOTHING
       RETURNING id`,
      [scanJobId, persistedCommitId, jobKey, "queued"]
    );
    let persistedScanJobId = jobInsert.rows[0]?.id;
    if (!persistedScanJobId) {
      const existingJob = await pool.query<{ id: string }>(`SELECT id FROM scan_jobs WHERE job_key = $1 LIMIT 1`, [jobKey]);
      persistedScanJobId = existingJob.rows[0]?.id ?? scanJobId;
    }

    await publishScanRequest({
      scanJobId: persistedScanJobId,
      repository: payload.repository.ssh_url,
      sha: payload.after,
      jobKey,
      callbackUrl: payload.callback_url ?? null
    });

    return res.status(202).json({ scanJobId: persistedScanJobId, status: "queued" });
  });

  app.get("/jobs", async (_req, res) => {
    const out = await pool.query(
      `SELECT
         sj.id,
         sj.job_key,
         sj.status,
         sj.queued_at,
         sj.started_at,
         sj.finished_at,
         c.commit_sha,
         c.branch,
         r.owner,
         r.name,
         sr.summary
       FROM scan_jobs sj
       JOIN commits c ON c.id = sj.commit_id
       JOIN repositories r ON r.id = c.repository_id
       LEFT JOIN scan_results sr ON sr.scan_job_id = sj.id
       ORDER BY sj.queued_at DESC
       LIMIT 50`
    );
    return res.json(out.rows);
  });

  app.use("/v1", requireAuth(authSecret));

  app.post("/v1/items", async (req, res) => {
    const item = {
      id: req.body.id ?? uuidv4(),
      name: String(req.body.name ?? ""),
      createdAt: new Date().toISOString()
    };
    const created = await dynamo.create(item);
    return res.status(201).json(created);
  });

  app.get("/v1/items/:id", async (req, res) => {
    const found = await dynamo.get(req.params.id);
    if (!found) return res.status(404).json({ error: "not found" });
    return res.json(found);
  });

  app.get("/v1/items", async (_req, res) => {
    const items = await dynamo.list();
    return res.json(items);
  });

  app.put("/v1/items/:id", async (req, res) => {
    const updated = await dynamo.update(req.params.id, String(req.body.name ?? ""));
    if (!updated) return res.status(404).json({ error: "not found" });
    return res.json(updated);
  });

  app.delete("/v1/items/:id", async (req, res) => {
    await dynamo.delete(req.params.id);
    return res.status(204).send();
  });

  return app;
}
