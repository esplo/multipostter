import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";

export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);
const PNPM_ALLOWED_BUILD_DEPENDENCIES = ["esbuild", "sharp", "unrs-resolver"];

interface Props extends cdk.StackProps {
  prefix: string;
  source: "misskey" | "mastodon";
}

export class MultipostterStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const table = new cdk.aws_dynamodb.Table(
      this,
      `${props.prefix}LastIDTable`,
      {
        partitionKey: {
          name: "sourceSNS",
          type: cdk.aws_dynamodb.AttributeType.STRING,
        },
        billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      },
    );

    const params = new cdk.aws_ssm.StringParameter(
      this,
      `${props.prefix}secrets`,
      {
        parameterName: `/multipostter/${props.prefix}/secrets`,
        stringValue: `{
  "BSKY_ID": "string",
  "BSKY_APP_PASS": "string",
  "MISSKEY_USER_ID": "string",
  "MASTODON_USER_ID": "string",
  "MASTODON_ACCESS_TOKEN": "string",
  "TWITTER_API_KEY": "string",
  "TWITTER_API_SECRET": "string",
  "TWITTER_ACCESS_TOKEN": "string",
  "TWITTER_ACCESS_TOKEN_SECRET": "string"
}`,
        tier: cdk.aws_ssm.ParameterTier.STANDARD,
      },
    );

    const fn = new cdk.aws_lambda_nodejs.NodejsFunction(
      this,
      `${props.prefix}multiPostFn`,
      {
        reservedConcurrentExecutions: 1,
        entry: path.join(__dirname, "../lambda/index.ts"),
        architecture: cdk.aws_lambda.Architecture.ARM_64, // change if your system is x86_64
        environment: {
          DDB_TABLE_NAME: table.tableName,
          PARAMSTORE_NAME: params.parameterName,
          SOURCE: props.source,
        },
        bundling: {
          format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
          mainFields: ["module", "main"],
          esbuildVersion: "0.28.0",
          minify: true,
          sourceMap: true,
          target: "es2024",
          tsconfig: path.join(__dirname, "../tsconfig.json"),
          // platform: "linux/arm64", // change if your system is x86_64
          // // https://github.com/aws/aws-cdk/issues/29310
          banner:
            "const require = (await import('node:module')).createRequire(import.meta.url);const __filename = (await import('node:url')).fileURLToPath(import.meta.url);const __dirname = (await import('node:path')).dirname(__filename);",
          commandHooks: {
            beforeInstall(_inputDir, outputDir) {
              return [
                "mkdir -p /tmp/cdk-bin",
                "printf '#!/bin/sh\\ntarget_dir=\"$PWD\"\\ncd /tmp/cdk-bin || exit 1\\nexec npm exec --yes --package=pnpm@10.33.0 -- pnpm --dir \"$target_dir\" \"$@\"\\n' > /tmp/cdk-bin/pnpm",
                "chmod +x /tmp/cdk-bin/pnpm",
                "export PATH=/tmp/cdk-bin:$PATH",
                `printf '%s\\n' ${PNPM_ALLOWED_BUILD_DEPENDENCIES.map((dependency) => `'only-built-dependencies[]=${dependency}'`).join(" ")} > ${path.posix.join(outputDir, ".npmrc")}`,
              ];
            },
            beforeBundling() {
              return [];
            },
            afterBundling() {
              return [];
            },
          },
          forceDockerBundling: true,
          nodeModules: ["sharp"],
        },
        memorySize: 2048,
        runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
        timeout: cdk.Duration.seconds(60), // if there are many posts, retry again
        retryAttempts: 0,
      },
    );

    table.grantReadWriteData(fn);
    params.grantRead(fn);

    new cdk.aws_events.Rule(this, `${props.prefix}RepeatRule`, {
      schedule: cdk.aws_events.Schedule.rate(cdk.Duration.minutes(10)),
      targets: [new cdk.aws_events_targets.LambdaFunction(fn)],
      enabled: true,
    });
  }
}
