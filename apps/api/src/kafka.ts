import { Kafka } from "kafkajs";

const broker = process.env.KAFKA_BROKER ?? "localhost:9092";
const topic = process.env.SCAN_REQUEST_TOPIC ?? "scan.requests";
const dlqTopic = process.env.SCAN_DLQ_TOPIC ?? "scan.requests.dlq";

const kafka = new Kafka({ clientId: "scan-api", brokers: [broker] });
const producer = kafka.producer();

export async function initKafka() {
  const admin = kafka.admin();
  await admin.connect();
  await admin.createTopics({
    waitForLeaders: true,
    topics: [
      { topic, numPartitions: 1, replicationFactor: 1 },
      { topic: dlqTopic, numPartitions: 1, replicationFactor: 1 }
    ]
  });
  await admin.disconnect();
  await producer.connect();
}

export async function publishScanRequest(payload: object) {
  await producer.send({
    topic,
    messages: [{ value: JSON.stringify(payload) }]
  });
}
