import { Kafka } from "kafkajs";

const broker = process.env.KAFKA_BROKER ?? "localhost:9092";
const topic = process.env.SCAN_REQUEST_TOPIC ?? "scan.requests";

const kafka = new Kafka({ clientId: "scan-api", brokers: [broker] });
const producer = kafka.producer();

export async function initKafka() {
  await producer.connect();
}

export async function publishScanRequest(payload: object) {
  await producer.send({
    topic,
    messages: [{ value: JSON.stringify(payload) }]
  });
}
