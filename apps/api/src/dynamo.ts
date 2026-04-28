import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export interface DynamoCrudItem {
  id: string;
  name: string;
  createdAt: string;
}

export function makeDynamoClient() {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const endpoint = process.env.DYNAMODB_ENDPOINT;
  const baseClient = new DynamoDBClient({
    region,
    ...(endpoint ? { endpoint, credentials: { accessKeyId: "dummy", secretAccessKey: "dummy" } } : {})
  });
  return DynamoDBDocumentClient.from(baseClient);
}

export class DynamoCrudService {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  async create(item: DynamoCrudItem) {
    await this.client.send(new PutCommand({ TableName: this.tableName, Item: item }));
    return item;
  }

  async get(id: string) {
    const out = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { id } }));
    return (out.Item as DynamoCrudItem | undefined) ?? null;
  }

  async list() {
    const out = await this.client.send(new ScanCommand({ TableName: this.tableName, Limit: 100 }));
    return (out.Items as DynamoCrudItem[] | undefined) ?? [];
  }

  async update(id: string, name: string) {
    const out = await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { id },
        UpdateExpression: "SET #name = :name",
        ExpressionAttributeNames: { "#name": "name" },
        ExpressionAttributeValues: { ":name": name },
        ReturnValues: "ALL_NEW"
      })
    );
    return (out.Attributes as DynamoCrudItem | undefined) ?? null;
  }

  async delete(id: string) {
    await this.client.send(new DeleteCommand({ TableName: this.tableName, Key: { id } }));
  }
}
