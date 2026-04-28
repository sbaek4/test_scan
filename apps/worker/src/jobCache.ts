import { CreateTableCommand, DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

export interface JobCacheRecord {
  jobKey: string;
  status: "succeeded";
  scanJobId: string;
  finishedAt: string;
  expiresAt: number;
}

export function makeJobCacheClient() {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const endpoint = process.env.DYNAMODB_ENDPOINT;
  const base = new DynamoDBClient({
    region,
    ...(endpoint ? { endpoint, credentials: { accessKeyId: "dummy", secretAccessKey: "dummy" } } : {})
  });
  return DynamoDBDocumentClient.from(base);
}

export async function ensureJobCacheTable(client: DynamoDBClient, tableName: string) {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return;
  } catch {
    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: "PAY_PER_REQUEST",
        KeySchema: [{ AttributeName: "jobKey", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "jobKey", AttributeType: "S" }]
      })
    );
  }
}

export class JobCacheService {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  async get(jobKey: string) {
    const out = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { jobKey } }));
    return (out.Item as JobCacheRecord | undefined) ?? null;
  }

  async put(record: JobCacheRecord) {
    await this.client.send(new PutCommand({ TableName: this.tableName, Item: record }));
  }
}
