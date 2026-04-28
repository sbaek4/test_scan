import { Kafka } from "kafkajs";
import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import { runSecurityScan } from "./scanner.js";
import { sendNotification } from "./notifier.js";
import { withRetry } from "./retry.js";
import { makeDlqPayload } from "./dlq.js";
import { ensureJobCacheTable, JobCacheService, makeJobCacheClient } from "./jobCache.js";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const broker = process.env.KAFKA_BROKER ?? "localhost:9092";
const topic = process.env.SCAN_REQUEST_TOPIC ?? "scan.requests";
const dlqTopic = process.env.SCAN_DLQ_TOPIC ?? "scan.requests.dlq";
const retryCount = Number(process.env.SCAN_RETRY_COUNT ?? 3);
const retryDelayMs = Number(process.env.SCAN_RETRY_DELAY_MS ?? 750);
const cacheTable = process.env.DYNAMO_JOB_CACHE_TABLE ?? "finished_scan_jobs";
const cacheTtlSec = Number(process.env.JOB_CACHE_TTL_SECONDS ?? 86400);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function start() {
  const kafka = new Kafka({ clientId: "scan-worker", brokers: [broker] });
  const consumer = kafka.consumer({ groupId: "scan-workers" });
  const producer = kafka.producer();
  const cacheDocClient = makeJobCacheClient();
  const cacheService = new JobCacheService(cacheDocClient, cacheTable);
  const rawDynamo = new DynamoDBClient({
    region: process.env.AWS_REGION ?? "us-east-1",
    ...(process.env.DYNAMODB_ENDPOINT
      ? { endpoint: process.env.DYNAMODB_ENDPOINT, credentials: { accessKeyId: "dummy", secretAccessKey: "dummy" } }
      : {})
  });

  await ensureJobCacheTable(rawDynamo, cacheTable);
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const event = JSON.parse(message.value.toString()) as {
        scanJobId: string;
        repository: string;
        sha: string;
        jobKey?: string;
        callbackUrl?: string | null;
      };
      const jobKey = event.jobKey ?? `${event.repository}:${event.sha}`;
      const existingResult = await pool.query<{ found: number }>(
        `SELECT 1 as found FROM scan_results WHERE scan_job_id = $1 LIMIT 1`,
        [event.scanJobId]
      );
      if (existingResult.rows.length > 0) {
        await pool.query(`UPDATE scan_jobs SET status='succeeded', finished_at=NOW(), error_message=NULL WHERE id=$1`, [event.scanJobId]);
        if (event.callbackUrl) {
          await sendNotification(event.callbackUrl, {
            scanJobId: event.scanJobId,
            status: "succeeded",
            cached: true
          });
        }
        return;
      }
      const cached = await cacheService.get(jobKey);
      if (cached?.status === "succeeded") {
        await pool.query(`UPDATE scan_jobs SET status='succeeded', finished_at=NOW(), error_message=NULL WHERE id=$1`, [event.scanJobId]);
        if (event.callbackUrl) {
          await sendNotification(event.callbackUrl, {
            scanJobId: event.scanJobId,
            status: "succeeded",
            cached: true
          });
        }
        return;
      }

      await pool.query(`UPDATE scan_jobs SET status='running', started_at=NOW() WHERE id=$1`, [event.scanJobId]);

      try {
        const result = await withRetry(() => runSecurityScan(event.repository, event.sha), retryCount, retryDelayMs);

        await pool.query(
          `INSERT INTO scan_results (id, scan_job_id, summary, findings, scanner_version)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (scan_job_id) DO NOTHING`,
          [uuidv4(), event.scanJobId, result.summary, result.findings, result.scannerVersion]
        );

        await pool.query(`UPDATE scan_jobs SET status='succeeded', finished_at=NOW() WHERE id=$1`, [event.scanJobId]);
        await cacheService.put({
          jobKey,
          status: "succeeded",
          scanJobId: event.scanJobId,
          finishedAt: new Date().toISOString(),
          expiresAt: Math.floor(Date.now() / 1000) + cacheTtlSec
        });

        if (event.callbackUrl) {
          const resp = await sendNotification(event.callbackUrl, {
            scanJobId: event.scanJobId,
            status: "succeeded",
            summary: result.summary
          });
          await pool.query(
            `INSERT INTO notifications (id, scan_job_id, target_url, status, attempt_count, last_attempt_at, response_status, response_body)
             VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7)`,
            [uuidv4(), event.scanJobId, event.callbackUrl, resp.status < 300 ? "sent" : "failed", 1, resp.status, resp.body]
          );
        }
      } catch (error: unknown) {
        await pool.query(`UPDATE scan_jobs SET status='failed', finished_at=NOW(), error_message=$2 WHERE id=$1`, [
          event.scanJobId,
          String(error)
        ]);
        await producer.send({
          topic: dlqTopic,
          messages: [
            {
              value: JSON.stringify(makeDlqPayload({ event, error }))
            }
          ]
        });
      }
    }
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
