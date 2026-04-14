#!/usr/bin/env node

import { spawn } from "node:child_process";

const [functionName, ...extraArgs] = process.argv.slice(2);

if (!functionName) {
  console.error(
    "Usage: mise run lambda:logs -- <lambda-function-name> [aws logs tail args...]",
  );
  process.exit(1);
}

const region = process.env.AWS_REGION ?? "ap-northeast-1";
const logGroupName = `/aws/lambda/${functionName}`;
const child = spawn(
  "aws-vault",
  [
    "exec",
    "main",
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
