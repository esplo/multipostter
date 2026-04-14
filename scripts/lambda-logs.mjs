#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";

const [inputName, ...extraArgs] = process.argv.slice(2);

if (!inputName) {
  console.error(
    "Usage: mise run lambda:logs -- <lambda-function-name> [aws logs tail args...]",
  );
  process.exit(1);
}

const region = process.env.AWS_REGION ?? "ap-northeast-1";
const profile = process.env.AWS_VAULT_PROFILE ?? "main";

function runAws(args) {
  const result = spawnSync(
    "aws-vault",
    ["exec", profile, "--", "aws", ...args, "--region", region],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  return {
    error: result.error,
    ok: result.status === 0,
    stderr: result.stderr.trim(),
    stdout: result.stdout.trim(),
  };
}

function printAwsFailure(result) {
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  console.error(result.stderr || "AWS command failed.");
  process.exit(1);
}

function getFunctionName(functionName) {
  const exactMatch = runAws([
    "lambda",
    "get-function",
    "--function-name",
    functionName,
    "--query",
    "Configuration.FunctionName",
    "--output",
    "text",
  ]);

  if (exactMatch.ok) {
    return exactMatch.stdout;
  }

  if (
    !exactMatch.stderr.includes("ResourceNotFoundException") &&
    !exactMatch.stderr.includes("Function not found")
  ) {
    printAwsFailure(exactMatch);
  }

  const functionsResult = runAws(["lambda", "list-functions", "--output", "json"]);
  if (!functionsResult.ok) {
    printAwsFailure(functionsResult);
  }

  const functions = JSON.parse(functionsResult.stdout).Functions ?? [];
  const matches = functions
    .map((item) => item.FunctionName)
    .filter((name) => typeof name === "string" && name.includes(functionName));

  if (matches.length === 1) {
    console.error(`Resolved Lambda name to ${matches[0]}`);
    return matches[0];
  }

  if (matches.length > 1) {
    console.error(
      [
        `Lambda name '${functionName}' is ambiguous. Matching functions:`,
        ...matches.map((name) => `- ${name}`),
      ].join("\n"),
    );
    process.exit(1);
  }

  return null;
}

function findExistingLogGroup(logGroupName) {
  const logGroupsResult = runAws([
    "logs",
    "describe-log-groups",
    "--log-group-name-prefix",
    logGroupName,
    "--output",
    "json",
  ]);

  if (!logGroupsResult.ok) {
    printAwsFailure(logGroupsResult);
  }

  const logGroups = JSON.parse(logGroupsResult.stdout).logGroups ?? [];
  const exactMatch = logGroups.find((group) => group.logGroupName === logGroupName);
  if (exactMatch) {
    return exactMatch.logGroupName;
  }

  if (logGroups.length === 1 && logGroups[0].logGroupName) {
    console.error(`Resolved log group to ${logGroups[0].logGroupName}`);
    return logGroups[0].logGroupName;
  }

  return null;
}

function resolveLogGroup(nameOrGroup) {
  if (nameOrGroup.startsWith("/aws/lambda/")) {
    return findExistingLogGroup(nameOrGroup) ?? nameOrGroup;
  }

  const functionName = getFunctionName(nameOrGroup);
  if (!functionName) {
    console.error(`Lambda function '${nameOrGroup}' was not found in ${region}.`);
    process.exit(1);
  }

  const logGroupName = `/aws/lambda/${functionName}`;
  const existingLogGroup = findExistingLogGroup(logGroupName);
  if (existingLogGroup) {
    return existingLogGroup;
  }

  console.error(
    [
      `Lambda '${functionName}' exists, but log group '${logGroupName}' does not.`,
      "The function may not have run yet, so CloudWatch Logs has not created the log group.",
    ].join("\n"),
  );
  process.exit(1);
}

const logGroupName = resolveLogGroup(inputName);
const child = spawn(
  "aws-vault",
  [
    "exec",
    profile,
    "--",
    "aws",
    "logs",
    "tail",
    logGroupName,
    "--region",
    region,
    ...extraArgs,
  ],
  {
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
