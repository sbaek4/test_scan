import { Kafka } from "kafkajs";
import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import { runSecurityScan } from "./scanner.js";
import { sendNotification } from "./notifier.js";

const broker = process.env.KAFKA_BROKER ?? "localhost:9092";
const topic = process.env.SCAN_REQUEST_TOPIC ?? "scan.requests";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function start() {
  const kafka = new Kafka({ clientId: "scan-worker", brokers: [broker] });
  const consumer = kafka.consumer({ groupId: "scan-workers" });

  await consumer.connect();
  await consumer.subscribe({ topic });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const event = JSON.parse(message.value.toString()) as {
        scanJobId: string;
        repository: string;
        sha: string;
        callbackUrl?: string | null;
      };

      await pool.query(`UPDATE scan_jobs SET status='running', started_at=NOW() WHERE id=$1`, [event.scanJobId]);

      try {
        const result = await runSecurityScan(event.repository, event.sha);

        await pool.query(`INSERT INTO scan_results (id, scan_job_id, summary, findings, scanner_version) VALUES ($1,$2,$3,$4,$5)`, [
          uuidv4(),
          event.scanJobId,
          result.summary,
          result.findings,
          result.scannerVersion
        ]);

        await pool.query(`UPDATE scan_jobs SET status='succeeded', finished_at=NOW() WHERE id=$1`, [event.scanJobId]);

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
      }
    }
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
