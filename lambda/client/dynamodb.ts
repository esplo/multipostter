import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  type QueryCommandOutput,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { SNSSource } from "./types.js";

const PKEY = "sourceSNS";

export class DDBClient {
  private client: DynamoDBDocumentClient;
  private table: string;

  constructor(table: string, region: string = "ap-northeast-1") {
    const rawclient = new DynamoDBClient({ region });
    this.client = DynamoDBDocumentClient.from(rawclient);
    this.table = table;
  }

  async putLastID(id: string, source: SNSSource) {
    const command = new UpdateCommand({
      TableName: this.table,
      Key: {
        [PKEY]: source,
      },
      UpdateExpression: "set lastid = :lastid",
      ExpressionAttributeValues: {
        ":lastid": id,
      },
      ReturnValues: "NONE",
    });
    const response = await this.client.send(command);
    console.log(response);
  }

  async getLastID(source: SNSSource): Promise<string | undefined> {
    const command = new QueryCommand({
      TableName: this.table,
      KeyConditionExpression: `${PKEY} = :source`,
      ExpressionAttributeValues: {
        ":source": source,
      },
    });
    type OUTPUT = Omit<QueryCommandOutput, "Items"> & {
      Items?: { source: string; lastid: string }[];
    };
    const response = (await this.client.send(command)) as OUTPUT;
    const items = response.Items ?? [];
    console.log(items);
    if (items.length === 0) {
      return undefined;
    }
    return items[0]?.lastid;
  }
}
